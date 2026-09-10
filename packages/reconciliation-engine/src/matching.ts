/**
 * Deterministic payment-to-invoice matching.
 *
 * This module implements the matching pass described in
 * /docs/reconciliation-rules.md Section 2 (Payment-to-invoice matching).
 *
 * The pass is built ONCE at the top of an engine run and shared by
 * Rules 3 (Underpayment) and 4 (Unallocated payment).
 *
 * Matching rules (in priority order):
 *   1. Exact link:     payment.invoice_id == invoice.id
 *   2. Reference match: payment.tenant_id == invoice.tenant_id
 *                       AND payment.payment_reference == invoice.external_id
 *   3. Amount + date proximity:
 *                       payment.tenant_id == invoice.tenant_id
 *                       AND |payment.amount - invoice.amount| ≤ T(invoice.amount)
 *                       AND |payment.payment_date - invoice.invoice_date| ≤ 60 days
 *
 * Allocation order: FIFO within a tenant. A payment is allocated to the
 * oldest matching open invoice first. (Open = invoice has an outstanding balance
 * after prior allocations.)
 *
 * A payment that cannot be allocated is classified as unallocated, with a
 * reason: null_tenant, no_open_invoices, ambiguous_match, or no_match.
 *
 * AI is never used to decide payment allocation. Deterministic only.
 */

import type {
  MatchingContext,
  NormalisedInvoice,
  NormalisedPayment,
  UnallocatedReason,
  UUID,
} from './types';
import { compareKobo, tolerance } from './decimal';
import { daysBetween } from './period';

const DATE_PROXIMITY_DAYS = 60;

interface OpenInvoice {
  invoice: NormalisedInvoice;
  outstandingBalance: number; // kobo
  index: number; // original index in invoices array, for FIFO ordering
}

/**
 * Build the matching context for a set of invoices and payments.
 *
 * Invoices and payments should already be filtered to the same currency
 * (cross-currency matching is not supported in the MVP).
 */
export function buildMatchingContext(
  invoices: NormalisedInvoice[],
  payments: NormalisedPayment[],
): MatchingContext {
  const allocationsByInvoice = new Map<UUID, Array<{ payment: NormalisedPayment; matchRule: 1 | 2 | 3 }>>();
  const allocationByPayment = new Map<UUID, { invoice: NormalisedInvoice; matchRule: 1 | 2 | 3 }>();
  const unallocatedPayments: Array<{ payment: NormalisedPayment; reason: UnallocatedReason; candidateInvoiceIds: UUID[] }> = [];

  // Track open invoices by tenant for FIFO allocation.
  const openInvoicesByTenant = new Map<UUID, OpenInvoice[]>();
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i]!;
    if (!inv.tenantId) continue; // cannot match without tenant
    if (!openInvoicesByTenant.has(inv.tenantId)) {
      openInvoicesByTenant.set(inv.tenantId, []);
    }
    openInvoicesByTenant.get(inv.tenantId)!.push({
      invoice: inv,
      outstandingBalance: inv.amount,
      index: i,
    });
    allocationsByInvoice.set(inv.id, []);
  }

  // Sort payments by payment_date ascending (FIFO: oldest first), preserving
  // original order for ties.
  const sortedPayments = payments
    .map((p, idx) => ({ payment: p, idx }))
    .sort((a, b) => {
      const dt = a.payment.paymentDate.localeCompare(b.payment.paymentDate);
      return dt !== 0 ? dt : a.idx - b.idx;
    })
    .map(x => x.payment);

  for (const payment of sortedPayments) {
    // Rule 1: exact link on invoice_id
    if (payment.invoiceId) {
      const inv = invoices.find(i => i.id === payment.invoiceId);
      if (inv) {
        // Find the open invoice entry (it must exist)
        const openList = inv.tenantId ? openInvoicesByTenant.get(inv.tenantId) : undefined;
        const openEntry = openList?.find(o => o.invoice.id === inv.id);
        if (openEntry && openEntry.outstandingBalance > 0) {
          allocate(payment, inv, openEntry, 1, allocationsByInvoice, allocationByPayment);
          continue;
        }
      }
    }

    // For Rules 2 and 3, we need the tenant.
    if (!payment.tenantId) {
      unallocatedPayments.push({
        payment,
        reason: 'null_tenant',
        candidateInvoiceIds: [],
      });
      continue;
    }

    const openList = openInvoicesByTenant.get(payment.tenantId) ?? [];

    // Rule 2: reference match (payment.payment_reference == invoice.external_id)
    if (payment.paymentReference) {
      const refMatches = openList
        .filter(o => o.outstandingBalance > 0)
        .filter(o => o.invoice.externalId === payment.paymentReference);
      if (refMatches.length === 1) {
        const openEntry = refMatches[0]!;
        allocate(payment, openEntry.invoice, openEntry, 2, allocationsByInvoice, allocationByPayment);
        continue;
      }
      // If refMatches.length > 1, that would be a duplicate external_id, which
      // shouldn't happen (uniqueness enforced at import). Treat as no match.
    }

    // Rule 3: amount + date proximity
    const tol = tolerance(payment.amount);
    const amountDateMatches = openList
      .filter(o => o.outstandingBalance > 0)
      .filter(o => {
        const amountMatch = compareKobo(payment.amount, o.invoice.amount, tol) === 0;
        const daysDiff = Math.abs(daysBetween(payment.paymentDate, o.invoice.invoiceDate));
        const dateMatch = daysDiff <= DATE_PROXIMITY_DAYS;
        return amountMatch && dateMatch;
      })
      // FIFO: oldest invoice first (smallest index = earliest in array = oldest by invoice_date sort)
      .sort((a, b) => a.index - b.index);

    if (amountDateMatches.length === 1) {
      const openEntry = amountDateMatches[0]!;
      allocate(payment, openEntry.invoice, openEntry, 3, allocationsByInvoice, allocationByPayment);
      continue;
    }

    if (amountDateMatches.length >= 2) {
      // Ambiguous match. List candidate invoices but don't auto-allocate.
      unallocatedPayments.push({
        payment,
        reason: 'ambiguous_match',
        candidateInvoiceIds: amountDateMatches.map(o => o.invoice.id),
      });
      continue;
    }

    // No match. Determine reason.
    if (openList.length === 0 || openList.every(o => o.outstandingBalance <= 0)) {
      unallocatedPayments.push({
        payment,
        reason: 'no_open_invoices',
        candidateInvoiceIds: [],
      });
    } else {
      unallocatedPayments.push({
        payment,
        reason: 'no_match',
        candidateInvoiceIds: [],
      });
    }
  }

  return {
    allocationsByInvoice,
    allocationByPayment,
    unallocatedPayments,
  };
}

function allocate(
  payment: NormalisedPayment,
  invoice: NormalisedInvoice,
  openEntry: OpenInvoice,
  matchRule: 1 | 2 | 3,
  allocationsByInvoice: MatchingContext['allocationsByInvoice'],
  allocationByPayment: MatchingContext['allocationByPayment'],
): void {
  allocationsByInvoice.get(invoice.id)!.push({ payment, matchRule });
  allocationByPayment.set(payment.id, { invoice, matchRule });
  openEntry.outstandingBalance -= payment.amount;
  // Note: we do NOT remove the invoice from openList here, even if balance hits 0,
  // because subsequent matching attempts check `outstandingBalance > 0`.
}
