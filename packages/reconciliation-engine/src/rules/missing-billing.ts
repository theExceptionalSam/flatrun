/**
 * Rule 2 — Missing Billing
 *
 * Trigger:
 *   For an active lease and a closed billing period:
 *   count(invoices for lease & period) == 0
 *
 * Grace window:
 *   Periods whose end date is within the last 7 days (configurable) of `asOf`
 *   are NOT flagged (invoices may still be in flight).
 *
 * Variance:
 *   expected_amount (full)
 *
 * Severity:
 *   critical  if period end > 30 days past
 *   high      if period end within 0-30 days past
 *   medium    if period is current
 *   (not flagged if within grace window)
 *
 * Confidence:
 *   0.95 (slight discount because the lease may have been terminated
 *   mid-period without us knowing)
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 2
 */

import type {
  ExceptionDraft,
  Kobo,
  NormalisedInvoice,
  NormalisedLease,
  Severity,
} from '../types';
import { daysBetween, periodContaining, isLeaseActiveForPeriod } from '../period';
import { expectedRentForPeriod } from '../escalation';
import { explainMissingBilling } from '../templates';

export function detectMissingBilling(
  lease: NormalisedLease,
  invoices: NormalisedInvoice[],
  asOf: string,
  graceDays: number = 7,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];

  // Find the earliest and latest invoice dates for this lease.
  const leaseInvoices = invoices.filter(inv => {
    if (inv.leaseId && inv.leaseId === lease.id) return true;
    if (inv.tenantId && inv.tenantId === lease.tenantId) return true;
    return false;
  });

  // Determine the range of periods to check.
  // Start from the lease start, end at min(asOf, lease.end_date or asOf).
  const periodEnd = lease.endDate && lease.endDate < asOf ? lease.endDate : asOf;

  // Iterate over periods from lease.startDate to periodEnd.
  // For monthly, step by 1 month. For quarterly, step by 3 months. Etc.
  // We iterate up to a safety limit (e.g., 600 periods = 50 years monthly).
  let cursor = lease.startDate;
  const periodLengthMonths = lease.frequency === 'monthly' ? 1
    : lease.frequency === 'quarterly' ? 3
    : lease.frequency === 'semi_annual' ? 6
    : 12;

  for (let i = 0; i < 600; i++) {
    if (cursor > periodEnd) break;

    const period = periodContaining(cursor, lease.startDate, lease.frequency);

    if (!isLeaseActiveForPeriod(lease.startDate, lease.endDate, period)) {
      // Move to next period
      cursor = addMonthsLocal(cursor, periodLengthMonths);
      continue;
    }

    // Check if any invoice falls in this period.
    const hasInvoice = leaseInvoices.some(inv =>
      inv.invoiceDate >= period.start && inv.invoiceDate <= period.end
    );

    if (!hasInvoice) {
      // Apply grace window: if period.end is within graceDays of asOf, skip.
      const daysSincePeriodEnd = daysBetween(asOf, period.end);
      if (daysSincePeriodEnd < graceDays && daysSincePeriodEnd >= -graceDays) {
        // Within grace window, skip.
      } else {
        const expected = expectedRentForPeriod(lease, period.start);
        const severity = computeSeverity(period.end, asOf);
        const confidence = 0.95;

        drafts.push({
          exception_type: 'missing_billing',
          severity,
          financial_variance: expected,
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
            evidence_explanation: `Missing billing for period ${period.start} to ${period.end}: no invoices found for this lease in this period. Expected rent: ${lease.currency} ${expected} kobo.`,
          },
          explanation: explainMissingBilling({
            lease,
            periodStart: period.start,
            periodEnd: period.end,
            expected,
            actual: 0 as Kobo,
            variance: expected,
            currency: lease.currency,
            confidence,
            matchedInvoices: [],
            matchedPayments: [],
            evidenceSummary: '',
          }),
          confidence,
        });
      }
    }

    // Move to next period
    cursor = addMonthsLocal(cursor, periodLengthMonths);
  }

  return drafts;
}

function computeSeverity(periodEnd: string, asOf: string): Severity {
  const daysPast = daysBetween(asOf, periodEnd);
  if (daysPast > 30) return 'critical';
  if (daysPast >= 0) return 'high'; // 0-30 days past
  return 'medium'; // period is current or future
}

function addMonthsLocal(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1));
  const lastDayOfMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  const yyyy = result.getUTCFullYear();
  const mm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(result.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
