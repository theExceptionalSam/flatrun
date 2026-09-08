/**
 * Rule 1 — Underbilling
 *
 * Trigger:
 *   For an active lease and a closed billing period:
 *   sum(invoices for lease & period) < expected_amount − T(expected_amount)
 *
 * Severity:
 *   critical  if variance ≥ 1 month's expected rent OR variance ≥ ₦1,000,000
 *   high      if variance ≥ 25% of expected
 *   medium    otherwise
 *
 * Confidence:
 *   1.00 if lease has explicit lease_id linkage on invoices
 *   0.85 if linkage inferred by (tenant + period)
 *
 * Suppression:
 *   If Rule 5 (Missed Escalation) fires for the same (lease, period),
 *   Rule 1 is suppressed for that period. The escalation is the more
 *   specific explanation.
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 1
 */

import type {
  ExceptionDraft,
  Kobo,
  NormalisedInvoice,
  NormalisedLease,
  Severity,
} from '../types.js';
import { compareKobo, sumKobo, tolerance } from '../decimal.js';
import { periodContaining } from '../period.js';
import { expectedRentForPeriod } from '../escalation.js';
import { explainUnderbilling } from '../templates.js';

interface PeriodInvoices {
  periodStart: string;
  periodEnd: string;
  expected: Kobo;
  invoices: NormalisedInvoice[];
  inferredLink: boolean;  // true if invoice didn't have explicit lease_id
}

/**
 * Group invoices by their containing billing period for a lease.
 */
export function groupInvoicesByPeriod(
  lease: NormalisedLease,
  invoices: NormalisedInvoice[],
): PeriodInvoices[] {
  // Only invoices that belong to this lease (by tenant_id, possibly by lease_id).
  const leaseInvoices = invoices.filter(inv => {
    if (inv.leaseId && inv.leaseId === lease.id) return true;
    // Infer by tenant match
    if (inv.tenantId && inv.tenantId === lease.tenantId) return true;
    return false;
  });

  // Group by period (using the invoice_date to determine the period)
  const periodMap = new Map<string, NormalisedInvoice[]>();
  for (const inv of leaseInvoices) {
    const period = periodContaining(inv.invoiceDate, lease.startDate, lease.frequency);
    const key = period.start;
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(inv);
  }

  const result: PeriodInvoices[] = [];
  for (const [periodStart, periodInvs] of periodMap) {
    const period = periodContaining(periodStart, lease.startDate, lease.frequency);
    const expected = expectedRentForPeriod(lease, periodStart);
    // Did any invoice have explicit lease_id linkage?
    const inferredLink = !periodInvs.some(i => i.leaseId === lease.id);
    result.push({
      periodStart: period.start,
      periodEnd: period.end,
      expected,
      invoices: periodInvs,
      inferredLink,
    });
  }
  return result;
}

export function detectUnderbilling(
  lease: NormalisedLease,
  invoices: NormalisedInvoice[],
  suppressedPeriods: Set<string>, // periods where Rule 5 fired; suppress Rule 1
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];
  const periodGroups = groupInvoicesByPeriod(lease, invoices);

  for (const group of periodGroups) {
    if (suppressedPeriods.has(group.periodStart)) continue;

    const actual = sumKobo(group.invoices.map(i => i.amount));
    const tol = tolerance(group.expected);
    const cmp = compareKobo(actual, group.expected, tol);

    if (cmp >= 0) continue; // billed ≥ expected, no underbilling

    const variance = group.expected - actual;

    const severity = computeSeverity(variance, group.expected);
    const confidence = group.inferredLink ? 0.85 : 1.00;

    const draft: ExceptionDraft = {
      exception_type: 'underbilling',
      severity,
      financial_variance: variance,
      currency: lease.currency,
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
        invoices: group.invoices.map(i => ({
          kind: 'invoice' as const,
          id: i.id,
          externalId: i.externalId,
          snapshot: i.raw as Record<string, unknown>,
        })),
        evidence_explanation: `Underbilling for period ${group.periodStart} to ${group.periodEnd}: expected ${lease.currency} ${group.expected} kobo, billed ${actual} kobo, variance ${variance} kobo.`,
      },
      explanation: explainUnderbilling({
        lease,
        periodStart: group.periodStart,
        periodEnd: group.periodEnd,
        expected: group.expected,
        actual,
        variance,
        currency: lease.currency,
        confidence,
        matchedInvoices: group.invoices,
        matchedPayments: [],
        evidenceSummary: '',
      }),
      confidence,
    };
    drafts.push(draft);
  }

  return drafts;
}

function computeSeverity(variance: Kobo, expected: Kobo): Severity {
  const ONE_MONTH_RENT = expected; // approximation: variance ≥ 1 month's expected rent
  const NGN_1M = 100_000_000; // ₦1,000,000 = 100,000,000 kobo
  if (variance >= ONE_MONTH_RENT || variance >= NGN_1M) return 'critical';
  if (variance >= Math.round(expected * 0.25)) return 'high';
  return 'medium';
}
