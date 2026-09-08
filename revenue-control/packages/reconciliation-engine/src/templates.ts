/**
 * Deterministic explanation templates.
 *
 * Each exception type has a template that generates a human-readable
 * explanation from the evidence. The template output is stored in
 * `exceptions.explanation` and is always present.
 *
 * Templates are versioned. Any change is a schema migration (historical
 * exceptions keep their original text; new exceptions use the new template).
 *
 * AI may additionally produce an `ai_explanation`, but it is always clearly
 * labelled as AI-generated and supplements (never replaces) the deterministic
 * explanation.
 *
 * Source of truth: /docs/reconciliation-rules.md Section 7
 */

import type {
  ExceptionDraft,
  Kobo,
  NormalisedInvoice,
  NormalisedLease,
  NormalisedPayment,
} from './types.js';
import { formatNaira } from './decimal.js';

interface TemplateContext {
  lease: NormalisedLease;
  periodStart: string;
  periodEnd: string;
  expected: Kobo;
  actual: Kobo;
  variance: Kobo;
  currency: string;
  confidence: number;
  matchedInvoices: NormalisedInvoice[];
  matchedPayments: NormalisedPayment[];
  evidenceSummary: string;
}

export function explainUnderbilling(ctx: TemplateContext): string {
  return [
    `Underbilling detected for tenant "${ctx.lease.tenantExternalId}" (lease ${ctx.lease.externalId}).`,
    `Expected billing for period ${ctx.periodStart} to ${ctx.periodEnd} was ${ctx.currency} ${formatNaira(ctx.expected)},`,
    `but ${ctx.matchedInvoices.length} invoice(s) summed to ${ctx.currency} ${formatNaira(ctx.actual)},`,
    `resulting in a variance of ${ctx.currency} ${formatNaira(ctx.variance)}.`,
    `Confidence: ${ctx.confidence.toFixed(2)}.`,
    `Source: ${ctx.matchedInvoices.length} invoice(s) reviewed.`,
  ].join(' ');
}

export function explainMissingBilling(ctx: TemplateContext): string {
  return [
    `Missing billing detected for tenant "${ctx.lease.tenantExternalId}" (lease ${ctx.lease.externalId}).`,
    `Expected billing for period ${ctx.periodStart} to ${ctx.periodEnd} was ${ctx.currency} ${formatNaira(ctx.expected)},`,
    `but no invoices were found for this lease in this period.`,
    `Variance: ${ctx.currency} ${formatNaira(ctx.variance)}.`,
    `Confidence: ${ctx.confidence.toFixed(2)}.`,
    `Source: invoice search returned 0 rows for this lease and period.`,
  ].join(' ');
}

export function explainUnderpayment(
  invoice: NormalisedInvoice,
  paidAmount: Kobo,
  variance: Kobo,
  currency: string,
  confidence: number,
  matchedPayments: NormalisedPayment[],
): string {
  return [
    `Underpayment detected for invoice ${invoice.externalId} (tenant ${invoice.tenantExternalId ?? 'unknown'}).`,
    `Invoice amount: ${currency} ${formatNaira(invoice.amount)}.`,
    `Sum of matched payments (${matchedPayments.length} payment(s)): ${currency} ${formatNaira(paidAmount)}.`,
    `Variance: ${currency} ${formatNaira(variance)}.`,
    `Confidence: ${confidence.toFixed(2)}.`,
    `Source: ${matchedPayments.length} payment(s) matched to this invoice.`,
  ].join(' ');
}

export function explainUnallocatedPayment(
  payment: NormalisedPayment,
  reason: string,
  candidateInvoiceIds: string[],
  currency: string,
): string {
  const candidateCount = candidateInvoiceIds.length;
  const candidatePart = candidateCount > 0
    ? `Candidate invoice(s) for human disambiguation: ${candidateInvoiceIds.join(', ')}.`
    : 'No candidate invoices identified.';
  return [
    `Unallocated payment detected for payment ${payment.externalId}.`,
    `Payment amount: ${currency} ${formatNaira(payment.amount)}.`,
    `Reason: ${reason}.`,
    candidatePart,
    `Confidence based on reason.`,
  ].join(' ');
}

export function explainMissedEscalation(ctx: TemplateContext): string {
  return [
    `Missed escalation detected for tenant "${ctx.lease.tenantExternalId}" (lease ${ctx.lease.externalId}).`,
    `Lease escalation type: ${ctx.lease.escalationType}.`,
    `Expected rent for period ${ctx.periodStart} to ${ctx.periodEnd} after escalation: ${ctx.currency} ${formatNaira(ctx.expected)}.`,
    `Billed amount: ${ctx.currency} ${formatNaira(ctx.actual)}.`,
    `Variance: ${ctx.currency} ${formatNaira(ctx.variance)}.`,
    `Confidence: ${ctx.confidence.toFixed(2)}.`,
    `Source: lease escalation clause + ${ctx.matchedInvoices.length} invoice(s) for the period.`,
  ].join(' ');
}

export function explainDuplicateInvoice(
  invoice1: NormalisedInvoice,
  invoice2: NormalisedInvoice,
  variance: Kobo,
  currency: string,
  subType: 'duplicate' | 'near_duplicate' | 'anomalous_amount',
): string {
  if (subType === 'duplicate') {
    return [
      `Duplicate invoice detected for tenant "${invoice1.tenantExternalId ?? 'unknown'}".`,
      `Invoices ${invoice1.externalId} and ${invoice2.externalId} have identical tenant, lease, period, and amount.`,
      `Suspected duplicate variance: ${currency} ${formatNaira(variance)}.`,
      `Confidence: 0.95. The second invoice is flagged as the suspected duplicate.`,
      `Source: 2 invoice records with matching keys.`,
    ].join(' ');
  }
  if (subType === 'near_duplicate') {
    return [
      `Near-duplicate invoice detected for tenant "${invoice1.tenantExternalId ?? 'unknown'}".`,
      `Invoices ${invoice1.externalId} and ${invoice2.externalId} cover the same period with amounts within 5%, issued within 7 days.`,
      `Variance: ${currency} ${formatNaira(variance)}.`,
      `Confidence: 0.80.`,
      `Source: 2 invoice records with overlapping period and close amount/date.`,
    ].join(' ');
  }
  // anomalous_amount
  return [
    `Anomalous billing detected for invoice ${invoice1.externalId} (tenant ${invoice1.tenantExternalId ?? 'unknown'}).`,
    `Invoice amount ${currency} ${formatNaira(invoice1.amount)} exceeds 3× the expected amount for its period.`,
    `Variance: ${currency} ${formatNaira(variance)}.`,
    `Confidence: 0.70.`,
    `Source: 1 invoice record compared against lease expected rent.`,
  ].join(' ');
}
