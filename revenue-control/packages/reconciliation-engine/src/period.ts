/**
 * Billing period math.
 *
 * A billing period is derived from a lease's start date and frequency:
 *  - monthly:     1st to last day of calendar month
 *  - quarterly:   3-month windows starting from lease.start_date
 *  - semi_annual: 6-month windows starting from lease.start_date
 *  - annual:      12-month windows starting from lease.start_date
 *
 * Source of truth: /docs/reconciliation-rules.md Section 2 (Billing period, Lease active)
 */

import type { LeaseFrequency } from './types.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface Period {
  /** Inclusive start date (YYYY-MM-DD) */
  start: string;
  /** Inclusive end date (YYYY-MM-DD) */
  end: string;
}

/**
 * Parse an ISO date string (YYYY-MM-DD) into a UTC Date at midnight.
 * Throws on invalid input.
 */
export function parseDate(iso: string): Date {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return d;
}

/**
 * Format a UTC Date back to YYYY-MM-DD.
 */
export function formatDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Number of whole days between two ISO dates (a - b).
 * Positive if a is after b.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / MS_PER_DAY);
}

/**
 * Add months to a date, clamping the day to the last day of the target month.
 * e.g., 2025-01-31 + 1 month = 2025-02-28.
 */
export function addMonths(iso: string, months: number): string {
  const d = parseDate(iso);
  const day = d.getUTCDate();
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(Date.UTC(
    d.getUTCFullYear(),
    targetMonth,
    1,
  ));
  // Clamp day to last day of target month
  const lastDayOfMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  return formatDate(result);
}

/**
 * Last day of the month containing the given date.
 */
export function lastDayOfMonth(iso: string): string {
  const d = parseDate(iso);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), lastDay)));
}

/**
 * The length of a billing period in months for the given frequency.
 */
export function periodLengthMonths(freq: LeaseFrequency): number {
  switch (freq) {
    case 'monthly':     return 1;
    case 'quarterly':   return 3;
    case 'semi_annual': return 6;
    case 'annual':      return 12;
  }
}

/**
 * Generate the period that contains a given date, for a lease with the given
 * start date and frequency.
 *
 * Periods are anchored to lease.start_date. For monthly, the first period
 * starts on lease.start_date and ends on the last day of that month; subsequent
 * periods are calendar months.
 *
 * For quarterly / semi_annual / annual, the first period starts on
 * lease.start_date and spans the appropriate number of months.
 */
export function periodContaining(
  dateIso: string,
  leaseStartDate: string,
  frequency: LeaseFrequency,
): Period {
  const len = periodLengthMonths(frequency);

  if (frequency === 'monthly') {
    // Monthly periods are calendar months. The period containing `date` is
    // (first day of month) to (last day of month).
    const d = parseDate(dateIso);
    const start = formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const end = lastDayOfMonth(dateIso);
    return { start, end };
  }

  // For longer frequencies, periods are anchored to lease.start_date.
  // Find the period that contains `date`.
  // Start from lease.start_date and step forward by `len` months until we pass `date`.
  let periodStart = leaseStartDate;
  // Safety: don't iterate more than 1000 periods (1000 years for annual, etc.)
  for (let i = 0; i < 1000; i++) {
    const periodEnd = addMonths(periodStart, len);
    // Period is [periodStart, day-before-periodEnd).
    // We use inclusive end = day before next period start.
    const inclusiveEnd = addDays(periodEnd, -1);
    if (dateIso >= periodStart && dateIso <= inclusiveEnd) {
      return { start: periodStart, end: inclusiveEnd };
    }
    if (periodStart > dateIso) {
      // We've passed the date without finding a containing period.
      // This shouldn't happen, but as a fallback return the period that
      // starts just after the date.
      return { start: periodStart, end: inclusiveEnd };
    }
    periodStart = periodEnd;
  }
  throw new Error(`Could not find period containing ${dateIso} (lease start ${leaseStartDate}, frequency ${frequency})`);
}

/**
 * Add days to an ISO date. Negative days subtract.
 */
export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/**
 * Check if a period contains a date (inclusive on both ends).
 */
export function periodContains(period: Period, dateIso: string): boolean {
  return dateIso >= period.start && dateIso <= period.end;
}

/**
 * A lease is "active" for a period if:
 *   lease.start_date ≤ period.start
 *   AND (lease.end_date IS NULL OR period.start ≤ lease.end_date)
 */
export function isLeaseActiveForPeriod(
  leaseStartDate: string,
  leaseEndDate: string | null,
  period: Period,
): boolean {
  if (leaseStartDate > period.start) return false;
  if (leaseEndDate && period.start > leaseEndDate) return false;
  return true;
}
