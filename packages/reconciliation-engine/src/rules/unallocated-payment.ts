/**
 * Rule 4 — Unallocated Payment
 *
 * Trigger:
 *   A payment is flagged unallocated if any of:
 *   1. payment.tenant_id IS NULL or references a non-existent tenant.
 *   2. payment.tenant_id is known but the tenant has no open invoices.
 *   3. The payment ambiguously matches 2+ invoices (e.g., two invoices with
 *      the same amount in the same window) and no payment_reference
 *      disambiguates.
 *   4. (catch-all) No invoice matches any rule.
 *
 * Variance:
 *   payment.amount (the entire payment is unallocated by definition)
 *
 * Severity:
 *   high    if amount ≥ ₦1,000,000
 *   medium  otherwise
 *
 * Confidence:
 *   0.90  null_tenant
 *   0.95  no_open_invoices (tenant known, no open invoices)
 *   0.75  ambiguous_match
 *   0.70  no_match (catch-all)
 *
 * Important: Ambiguous matches are NOT auto-resolved. The candidate invoices
 * are listed in evidence for human disambiguation.
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 4
 */

import type {
  ExceptionDraft,
  Kobo,
  MatchingContext,
  NormalisedInvoice,
  NormalisedLease,
  NormalisedPayment,
  Severity,
  UnallocatedReason,
  UUID,
} from '../types';
import { explainUnallocatedPayment } from '../templates';

export function detectUnallocatedPayments(
  matching: MatchingContext,
  invoices: NormalisedInvoice[],
  leaseByTenant: Map<UUID, NormalisedLease>,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];
  const invoiceById = new Map(invoices.map(i => [i.id, i] as const));

  for (const { payment, reason, candidateInvoiceIds } of matching.unallocatedPayments) {
    const severity = computeSeverity(payment.amount);
    const confidence = confidenceFor(reason);

    const candidateInvoices = candidateInvoiceIds
      .map(id => invoiceById.get(id))
      .filter((x): x is NormalisedInvoice => !!x);

    const lease = payment.tenantId ? leaseByTenant.get(payment.tenantId) : undefined;

    const draft: ExceptionDraft = {
      exception_type: 'unallocated_payment',
      severity,
      financial_variance: payment.amount,
      currency: payment.currency,
      tenant_id: payment.tenantId,
      tenant_external_id: payment.tenantExternalId,
      property_id: lease?.propertyId ?? null,
      property_external_id: lease?.propertyExternalId ?? null,
      lease_id: lease?.id ?? null,
      lease_external_id: lease?.externalId ?? null,
      source_records: {
        lease: lease ? {
          kind: 'lease',
          id: lease.id,
          externalId: lease.externalId,
          snapshot: lease.raw as Record<string, unknown>,
        } : undefined,
        invoices: candidateInvoices.map(i => ({
          kind: 'invoice' as const,
          id: i.id,
          externalId: i.externalId,
          snapshot: i.raw as Record<string, unknown>,
        })),
        payments: [{
          kind: 'payment',
          id: payment.id,
          externalId: payment.externalId,
          snapshot: payment.raw as Record<string, unknown>,
        }],
        evidence_explanation: `Payment ${payment.externalId} amount ${payment.amount} kobo; unallocated due to: ${reason}. Candidate invoices: ${candidateInvoiceIds.length}.`,
      },
      explanation: explainUnallocatedPayment(
        payment,
        reason,
        candidateInvoiceIds,
        payment.currency,
      ),
      confidence,
    };
    drafts.push(draft);
  }

  return drafts;
}

function computeSeverity(amount: Kobo): Severity {
  const NGN_1M = 100_000_000; // ₦1,000,000 = 100,000,000 kobo
  return amount >= NGN_1M ? 'high' : 'medium';
}

function confidenceFor(reason: UnallocatedReason): number {
  switch (reason) {
    case 'null_tenant':         return 0.90;
    case 'no_open_invoices':    return 0.95;
    case 'ambiguous_match':    return 0.75;
    case 'no_match':            return 0.70;
  }
}
