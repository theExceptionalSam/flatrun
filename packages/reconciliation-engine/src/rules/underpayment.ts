/**
 * Rule 3 — Underpayment
 *
 * Trigger:
 *   An invoice exists with amount = X.
 *   After deterministic matching: sum(matched payments) < X − T(X)
 *
 * Severity:
 *   critical  if variance ≥ ₦5,000,000 OR invoice is > 90 days old
 *   high      if variance ≥ 25% of invoice amount
 *   medium    otherwise
 *
 * Confidence:
 *   1.00 for matches via Rule 1 (exact link) or Rule 2 (reference match)
 *   0.80 for matches via Rule 3 (amount + date proximity)
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 3
 */

import type {
  ExceptionDraft,
  Kobo,
  MatchingContext,
  NormalisedInvoice,
  NormalisedLease,
  Severity,
  UUID,
} from '../types.js';
import { compareKobo, sumKobo, tolerance } from '../decimal.js';
import { daysBetween } from '../period.js';
import { explainUnderpayment } from '../templates.js';

export function detectUnderpayment(
  invoices: NormalisedInvoice[],
  matching: MatchingContext,
  leaseByTenant: Map<UUID, NormalisedLease>,
  asOf: string,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];

  for (const invoice of invoices) {
    const allocations = matching.allocationsByInvoice.get(invoice.id) ?? [];
    if (allocations.length === 0) continue;

    const paidAmount = sumKobo(allocations.map(a => a.payment.amount));
    const tol = tolerance(invoice.amount);
    const cmp = compareKobo(paidAmount, invoice.amount, tol);

    if (cmp >= 0) continue; // paid ≥ invoice, no underpayment

    const variance = invoice.amount - paidAmount;
    const severity = computeSeverity(variance, invoice.amount, invoice.invoiceDate, asOf);

    // Confidence is the minimum confidence across all matched payments.
    // Rule 1 and Rule 2 → 1.00, Rule 3 → 0.80.
    const minMatchRule = Math.min(...allocations.map(a => a.matchRule));
    const confidence = minMatchRule === 3 ? 0.80 : 1.00;

    // Find lease (by tenant) for evidence
    const lease = invoice.tenantId ? leaseByTenant.get(invoice.tenantId) : undefined;

    const matchedPayments = allocations.map(a => a.payment);

    const draft: ExceptionDraft = {
      exception_type: 'underpayment',
      severity,
      financial_variance: variance,
      currency: invoice.currency,
      tenant_id: invoice.tenantId,
      tenant_external_id: invoice.tenantExternalId,
      property_id: lease?.propertyId ?? null,
      property_external_id: lease?.propertyExternalId ?? null,
      lease_id: lease?.id ?? invoice.leaseId ?? null,
      lease_external_id: lease?.externalId ?? null,
      source_records: {
        lease: lease ? {
          kind: 'lease',
          id: lease.id,
          externalId: lease.externalId,
          snapshot: lease.raw as Record<string, unknown>,
        } : undefined,
        invoices: [{
          kind: 'invoice',
          id: invoice.id,
          externalId: invoice.externalId,
          snapshot: invoice.raw as Record<string, unknown>,
        }],
        payments: matchedPayments.map(p => ({
          kind: 'payment' as const,
          id: p.id,
          externalId: p.externalId,
          snapshot: p.raw as Record<string, unknown>,
        })),
        evidence_explanation: `Invoice ${invoice.externalId} amount ${invoice.amount} kobo; matched payments total ${paidAmount} kobo; underpayment ${variance} kobo.`,
      },
      explanation: explainUnderpayment(
        invoice,
        paidAmount,
        variance,
        invoice.currency,
        confidence,
        matchedPayments,
      ),
      confidence,
    };
    drafts.push(draft);
  }

  return drafts;
}

function computeSeverity(
  variance: Kobo,
  invoiceAmount: Kobo,
  invoiceDate: string,
  asOf: string,
): Severity {
  const NGN_5M = 500_000_000; // ₦5,000,000 = 500,000,000 kobo
  const daysOld = daysBetween(asOf, invoiceDate);
  if (variance >= NGN_5M || daysOld > 90) return 'critical';
  if (variance >= Math.round(invoiceAmount * 0.25)) return 'high';
  return 'medium';
}
