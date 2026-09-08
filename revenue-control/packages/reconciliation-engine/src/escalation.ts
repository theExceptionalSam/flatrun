/**
 * Escalation math.
 *
 * For `escalation_type = 'percentage'`:
 *   years_elapsed = floor((period.start − escalation_start_date) / 365)
 *   steps = floor((years_elapsed × 12) / escalation_frequency_months)
 *   expected = rent_amount × (1 + escalation_rate) ^ steps
 *
 * For `escalation_type = 'fixed_amount'`:
 *   expected = rent_amount + (escalation_rate × steps)
 *   (escalation_rate is in kobo)
 *
 * For `escalation_type = 'none'`:
 *   expected = rent_amount (always)
 *
 * Source of truth: /docs/reconciliation-rules.md Section 2 (Escalation math)
 */

import type { Kobo, LeaseFrequency, NormalisedLease } from './types.js';
import { parseDate } from './period.js';

/**
 * Calculate the number of escalation steps that have elapsed as of a given date.
 *
 * The escalation_start_date is the date the FIRST escalation applies. From that
 * date onwards, the rent is escalated. Each subsequent escalation applies every
 * escalationFrequencyMonths months after the start date.
 *
 * Examples (escalation_start_date = 2025-06-01, frequency = 12 months):
 *   asOf = 2025-05-01 → steps = 0 (before escalation)
 *   asOf = 2025-06-01 → steps = 1 (first escalation applies)
 *   asOf = 2025-07-01 → steps = 1 (still in first escalation period)
 *   asOf = 2026-06-01 → steps = 2 (second escalation applies)
 *   asOf = 2027-06-01 → steps = 3
 */
export function escalationSteps(
  escalationStartDate: string | null,
  escalationFrequencyMonths: number | null,
  asOf: string,
): number {
  if (!escalationStartDate || !escalationFrequencyMonths) return 0;
  if (asOf < escalationStartDate) return 0;

  // Number of full calendar months between escalation_start_date and asOf.
  const monthsSinceStart = monthsBetween(escalationStartDate, asOf);
  // First escalation applies on the start date itself (monthsSinceStart = 0).
  // Each subsequent escalation applies every `frequencyMonths` months after.
  const steps = 1 + Math.floor(monthsSinceStart / escalationFrequencyMonths);
  return Math.max(1, steps);
}

/**
 * Number of full calendar months between two dates.
 * Returns 0 if both dates are in the same month.
 * Returns negative if `end` is before `start`.
 */
function monthsBetween(startIso: string, endIso: string): number {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (end.getUTCMonth() - start.getUTCMonth());
  // Adjust for day of month: if end.getUTCDate() < start.getUTCDate(),
  // the month hasn't fully elapsed.
  if (end.getUTCDate() < start.getUTCDate()) {
    return months - 1;
  }
  return months;
}

/**
 * Calculate the expected rent amount for a lease as of a given date,
 * applying escalation if applicable.
 *
 * All amounts are in kobo.
 */
export function expectedRentForDate(
  lease: NormalisedLease,
  asOf: string,
): Kobo {
  if (lease.escalationType === 'none') {
    return lease.rentAmount;
  }
  if (!lease.escalationStartDate || !lease.escalationFrequencyMonths || lease.escalationRate == null) {
    // Misconfigured escalation; treat as no escalation.
    return lease.rentAmount;
  }
  const steps = escalationSteps(
    lease.escalationStartDate,
    lease.escalationFrequencyMonths,
    asOf,
  );
  if (steps === 0) return lease.rentAmount;

  if (lease.escalationType === 'percentage') {
    // rent * (1 + rate) ^ steps, where rate is e.g., 0.05 for 5%.
    // Use Math.round at each step to keep kobo integer.
    let factor = 1 + lease.escalationRate;
    for (let i = 1; i < steps; i++) {
      factor = factor * (1 + lease.escalationRate);
    }
    return Math.round(lease.rentAmount * factor);
  }

  if (lease.escalationType === 'fixed_amount') {
    // rent + (rate × steps), where rate is in kobo.
    return lease.rentAmount + Math.round(lease.escalationRate * steps);
  }

  return lease.rentAmount;
}

/**
 * Expected rent for a billing period (the period that contains `periodStartDate`).
 */
export function expectedRentForPeriod(
  lease: NormalisedLease,
  periodStartDate: string,
): Kobo {
  // For monthly leases, use the period start date as the "as of" date.
  // For longer frequencies, use the period start date as well.
  return expectedRentForDate(lease, periodStartDate);
}

/**
 * Calculate the escalation anniversary date that applies for a given period.
 * Returns null if no escalation has occurred yet.
 *
 * For example, if escalation_start_date is 2025-06-01 and the period is
 * June 2025 (2025-06-01 to 2025-06-30), the anniversary date is 2025-06-01.
 *
 * For July 2025 (2025-07-01 to 2025-07-31), the anniversary date is still 2025-06-01
 * (the escalation has applied since June).
 */
export function escalationAnniversaryForPeriod(
  lease: NormalisedLease,
  periodStart: string,
): string | null {
  if (lease.escalationType === 'none') return null;
  if (!lease.escalationStartDate) return null;
  if (periodStart < lease.escalationStartDate) return null;
  return lease.escalationStartDate;
}
