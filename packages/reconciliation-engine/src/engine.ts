/**
 * Reconciliation engine — orchestrator.
 *
 * Builds the matching context once, then runs the six rules in the order
 * specified in /docs/reconciliation-rules.md Section 4:
 *
 *   1. Build MatchingContext (shared by Rules 3 & 4)
 *   2. Rule 6  — Duplicate / anomalous billing
 *   3. Rule 2  — Missing billing
 *   4. Rule 5  — Missed escalation  (returns fired periods → suppresses Rule 1)
 *   5. Rule 1  — Underbilling       (suppressed for periods where Rule 5 fired)
 *   6. Rule 3  — Underpayment       (uses MatchingContext)
 *   7. Rule 4  — Unallocated payment (uses MatchingContext)
 *
 * Rules do NOT call each other. They share the MatchingContext built once.
 */

import type {
  EngineConfig,
  EngineResult,
  ExceptionDraft,
  ExceptionType,
  Kobo,
  NormalisedInvoice,
  NormalisedLease,
  NormalisedPayment,
  NormalisedProperty,
  NormalisedTenant,
  UUID,
} from './types';
import { buildMatchingContext } from './matching';
import { detectDuplicateAnomalousBilling } from './rules/duplicate-anomalous-billing';
import { detectMissingBilling } from './rules/missing-billing';
import { detectMissedEscalation } from './rules/missed-escalation';
import { detectUnderbilling } from './rules/underbilling';
import { detectUnderpayment } from './rules/underpayment';
import { detectUnallocatedPayments } from './rules/unallocated-payment';
import { sumKobo } from './decimal';

export interface EngineInput {
  properties: NormalisedProperty[];
  tenants: NormalisedTenant[];
  leases: NormalisedLease[];
  invoices: NormalisedInvoice[];
  payments: NormalisedPayment[];
  config?: EngineConfig;
}

export function runReconciliation(input: EngineInput): EngineResult {
  const asOf = input.config?.asOf ?? new Date().toISOString().slice(0, 10);
  const graceDays = input.config?.missingBillingGraceDays ?? 7;

  // Group invoices and payments by currency so we only match within-currency.
  // For the MVP, cross-currency reconciliation is not supported.
  const currencies = new Set<string>();
  for (const inv of input.invoices) currencies.add(inv.currency);
  for (const pmt of input.payments) currencies.add(pmt.currency);

  const allDrafts: ExceptionDraft[] = [];
  const unmatchedInvoices: UUID[] = [];
  const unmatchedPayments: UUID[] = [];

  // Build lease lookup by tenant for evidence attribution
  const leaseByTenant = new Map<UUID, NormalisedLease>();
  for (const lease of input.leases) {
    leaseByTenant.set(lease.tenantId, lease);
  }

  // We process each currency separately.
  // (For the MVP, all data is typically in one currency.)
  for (const currency of currencies) {
    const currencyInvoices = input.invoices.filter(i => i.currency === currency);
    const currencyPayments = input.payments.filter(p => p.currency === currency);

    // 1. Build MatchingContext (shared by Rules 3 & 4)
    const matching = buildMatchingContext(currencyInvoices, currencyPayments);

    // 2. Rule 6 — Duplicate / anomalous billing
    const duplicates = detectDuplicateAnomalousBilling(input.leases, currencyInvoices, leaseByTenant);
    allDrafts.push(...duplicates);

    // For Rule 1 and Rule 5: process each lease.
    for (const lease of input.leases) {
      if (lease.currency !== currency) continue;

      // 4. Rule 5 — Missed escalation (must run before Rule 1; returns fired periods)
      const { drafts: missedEscalationDrafts, firedPeriods } = detectMissedEscalation(lease, currencyInvoices);
      allDrafts.push(...missedEscalationDrafts);

      // 3. Rule 2 — Missing billing
      const missing = detectMissingBilling(lease, currencyInvoices, asOf, graceDays);
      allDrafts.push(...missing);

      // 5. Rule 1 — Underbilling (suppressed for periods where Rule 5 fired)
      const underbilling = detectUnderbilling(lease, currencyInvoices, firedPeriods);
      allDrafts.push(...underbilling);
    }

    // 6. Rule 3 — Underpayment
    const underpayment = detectUnderpayment(currencyInvoices, matching, leaseByTenant, asOf);
    allDrafts.push(...underpayment);

    // 7. Rule 4 — Unallocated payments
    const unallocated = detectUnallocatedPayments(matching, currencyInvoices, leaseByTenant);
    allDrafts.push(...unallocated);

    // Track unmatched
    for (const inv of currencyInvoices) {
      const allocs = matching.allocationsByInvoice.get(inv.id) ?? [];
      if (allocs.length === 0) unmatchedInvoices.push(inv.id);
    }
    for (const pmt of matching.unallocatedPayments) {
      unmatchedPayments.push(pmt.payment.id);
    }
  }

  // Build summary
  const summary = buildSummary(input, allDrafts);

  return {
    exceptions: allDrafts,
    unmatched: {
      invoices: unmatchedInvoices,
      payments: unmatchedPayments,
    },
    summary,
  };
}

function buildSummary(
  input: EngineInput,
  drafts: ExceptionDraft[],
): EngineResult['summary'] {
  // Expected revenue = sum of expected rent for all active leases over all
  // periods covered by the data. This is a rough approximation for the MVP.
  // A more precise calculation would compute expected for each closed period.
  // For the MVP summary, we sum the lease.rentAmount × number of months the lease
  // was active over the data range.
  const expectedRevenue = input.leases.reduce((acc, lease) => acc + lease.rentAmount, 0);
  // Billed revenue = sum of all invoices
  const billedRevenue = input.invoices.reduce((acc, inv) => acc + inv.amount, 0 as Kobo);
  // Collected revenue = sum of all allocated payments
  const collectedRevenue = input.payments.reduce((acc, pmt) => acc + pmt.amount, 0 as Kobo);

  const countsByType: Record<ExceptionType, number> = {
    underbilling: 0,
    missing_billing: 0,
    underpayment: 0,
    unallocated_payment: 0,
    missed_escalation: 0,
    duplicate_anomalous_billing: 0,
  };
  for (const draft of drafts) {
    countsByType[draft.exception_type]++;
  }

  const totalVariance = drafts.reduce((acc, d) => acc + d.financial_variance, 0 as Kobo);

  return {
    expected_revenue: expectedRevenue,
    billed_revenue: billedRevenue,
    collected_revenue: collectedRevenue,
    counts_by_type: countsByType,
    total_variance: totalVariance,
  };
}
