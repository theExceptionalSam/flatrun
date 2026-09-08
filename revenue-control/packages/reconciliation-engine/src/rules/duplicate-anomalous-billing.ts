/**
 * Rule 6 — Duplicate / Anomalous Billing
 *
 * Three sub-detections:
 *
 * 6a — Duplicate invoices:
 *   Two invoices with identical (tenant_id, lease_id, period_start, period_end, amount).
 *   Variance = amount (the second invoice is the suspected duplicate).
 *   Severity = high. Confidence = 0.95.
 *
 * 6b — Near-duplicate invoices:
 *   Two invoices with same (tenant_id, period_start, period_end) but different
 *   amount within 5% of each other, issued within 7 days.
 *   Variance = |amount1 − amount2|.
 *   Severity = medium. Confidence = 0.80.
 *
 * 6c — Anomalous amount:
 *   A single invoice whose amount > 3 × expected_amount for its period.
 *   Variance = amount − expected.
 *   Severity = medium. Confidence = 0.70.
 *
 * Important: Rule 6 generates exceptions but NEVER suppresses the underlying
 * invoices. The user decides whether the duplicate is real or a legitimate
 * supplementary invoice.
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 6
 */

import type {
  ExceptionDraft,
  Kobo,
  NormalisedInvoice,
  NormalisedLease,
  Severity,
  UUID,
} from '../types.js';
import { expectedRentForPeriod } from '../escalation.js';
import { periodContaining } from '../period.js';
import { compareKobo, tolerance } from '../decimal.js';
import { daysBetween } from '../period.js';
import { explainDuplicateInvoice } from '../templates.js';

interface InvoicePeriodInfo {
  invoice: NormalisedInvoice;
  periodStart: string;
  periodEnd: string;
}

function invoicePeriodInfo(invoice: NormalisedInvoice, lease: NormalisedLease): InvoicePeriodInfo {
  const period = periodContaining(invoice.invoiceDate, lease.startDate, lease.frequency);
  return { invoice, periodStart: period.start, periodEnd: period.end };
}

export function detectDuplicateAnomalousBilling(
  leases: NormalisedLease[],
  invoices: NormalisedInvoice[],
  leaseByTenant: Map<UUID, NormalisedLease>,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];

  // Group invoices by tenant (so we can compare within a tenant).
  const invoicesByTenant = new Map<UUID, NormalisedInvoice[]>();
  for (const inv of invoices) {
    if (!inv.tenantId) continue;
    if (!invoicesByTenant.has(inv.tenantId)) invoicesByTenant.set(inv.tenantId, []);
    invoicesByTenant.get(inv.tenantId)!.push(inv);
  }

  // 6a — Exact duplicates and 6b — near-duplicates
  for (const [tenantId, tenantInvoices] of invoicesByTenant) {
    const lease = leaseByTenant.get(tenantId);
    if (!lease) continue;

    // Pre-compute period info for each invoice.
    const periodInfos = tenantInvoices.map(inv => invoicePeriodInfo(inv, lease));

    for (let i = 0; i < periodInfos.length; i++) {
      for (let j = i + 1; j < periodInfos.length; j++) {
        const a = periodInfos[i]!;
        const b = periodInfos[j]!;
        if (a.invoice.id === b.invoice.id) continue;

        // 6a — exact duplicate
        if (
          a.periodStart === b.periodStart &&
          a.periodEnd === b.periodEnd &&
          a.invoice.amount === b.invoice.amount &&
          (a.invoice.leaseId ?? null) === (b.invoice.leaseId ?? null)
        ) {
          drafts.push(buildDuplicateDraft(
            a.invoice,
            b.invoice,
            a.invoice.amount,
            lease,
            'duplicate',
            a.periodStart,
            a.periodEnd,
          ));
          continue;
        }

        // 6b — near-duplicate (same period, amounts within 5%, within 7 days)
        if (
          a.periodStart === b.periodStart &&
          a.periodEnd === b.periodEnd
        ) {
          const tol = tolerance(a.invoice.amount, 0.05); // 5% tolerance
          if (compareKobo(a.invoice.amount, b.invoice.amount, tol) === 0) {
            const daysDiff = Math.abs(daysBetween(a.invoice.invoiceDate, b.invoice.invoiceDate));
            if (daysDiff <= 7) {
              const variance = Math.abs(a.invoice.amount - b.invoice.amount);
              drafts.push(buildDuplicateDraft(
                a.invoice,
                b.invoice,
                variance,
                lease,
                'near_duplicate',
                a.periodStart,
                a.periodEnd,
              ));
            }
          }
        }
      }
    }
  }

  // 6c — anomalous amount
  for (const inv of invoices) {
    if (!inv.tenantId) continue;
    const lease = leaseByTenant.get(inv.tenantId);
    if (!lease) continue;

    const expected = expectedRentForPeriod(lease, periodContaining(inv.invoiceDate, lease.startDate, lease.frequency).start);
    if (expected === 0) continue; // can't compute ratio

    const ratio = inv.amount / expected;
    if (ratio > 3) {
      const variance = inv.amount - expected;
      drafts.push(buildDuplicateDraft(
        inv,
        inv, // self-paired for anomalous
        variance,
        lease,
        'anomalous_amount',
        periodContaining(inv.invoiceDate, lease.startDate, lease.frequency).start,
        periodContaining(inv.invoiceDate, lease.startDate, lease.frequency).end,
      ));
    }
  }

  return drafts;
}

function buildDuplicateDraft(
  invoice1: NormalisedInvoice,
  invoice2: NormalisedInvoice,
  variance: Kobo,
  lease: NormalisedLease,
  subType: 'duplicate' | 'near_duplicate' | 'anomalous_amount',
  periodStart: string,
  periodEnd: string,
): ExceptionDraft {
  const severity: Severity = subType === 'duplicate' ? 'high' : 'medium';
  const confidence = subType === 'duplicate' ? 0.95 : subType === 'near_duplicate' ? 0.80 : 0.70;

  return {
    exception_type: 'duplicate_anomalous_billing',
    severity,
    financial_variance: variance,
    currency: invoice1.currency,
    tenant_id: lease.tenantId,
    tenant_external_id: lease.tenantExternalId,
    property_id: lease.propertyId,
    property_external_id: lease.propertyExternalId,
    lease_id: lease.id,
    lease_external_id: lease.externalId,
    source_records: {
      lease: {
        kind: 'lease',
        id: lease.id,
        externalId: lease.externalId,
        snapshot: lease.raw as Record<string, unknown>,
      },
      invoices: [
        {
          kind: 'invoice',
          id: invoice1.id,
          externalId: invoice1.externalId,
          snapshot: invoice1.raw as Record<string, unknown>,
        },
        ...(invoice1.id !== invoice2.id ? [{
          kind: 'invoice' as const,
          id: invoice2.id,
          externalId: invoice2.externalId,
          snapshot: invoice2.raw as Record<string, unknown>,
        }] : []),
      ],
      evidence_explanation: `Period ${periodStart} to ${periodEnd}; sub-type: ${subType}; variance: ${variance} kobo.`,
    },
    explanation: explainDuplicateInvoice(invoice1, invoice2, variance, lease.currency, subType),
    confidence,
    sub_type: subType,
  };
}
