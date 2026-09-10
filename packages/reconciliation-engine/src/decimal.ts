/**
 * Decimal arithmetic helpers.
 *
 * All money in the engine is integer kobo (1 NGN = 100 kobo).
 * This avoids floating-point dust entirely for amounts up to
 * ~92 trillion NGN (Number.MAX_SAFE_INTEGER / 100).
 *
 * Conversion to/from Naira happens only at the I/O boundary.
 *
 * Source of truth: /docs/reconciliation-rules.md Section 2 (Tolerance)
 */

import type { Kobo } from './types';

/**
 * Convert a Naira amount (possibly decimal) to integer kobo.
 * Rounds to nearest kobo, half-up.
 */
export function nairaToKobo(naira: number): Kobo {
  return Math.round(naira * 100);
}

/**
 * Convert integer kobo back to a Naira number (with 2 decimals).
 */
export function koboToNaira(kobo: Kobo): number {
  return kobo / 100;
}

/**
 * Format kobo as a Naira string with thousands separators and 2 decimals.
 * Example: 5_250_000 → "5,250,000.00"
 */
export function formatNaira(kobo: Kobo): string {
  const naira = koboToNaira(kobo);
  return naira.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Tolerance for monetary comparisons.
 *
 * A discrepancy is flagged only when |expected - actual| > T(expected)
 * where T(amount) = max(minTolerance, amount * factor).
 *
 * Defaults match the spec in /docs/reconciliation-rules.md:
 *   factor = 0.0001 (0.01%)
 *   minTolerance = 100 kobo = ₦1.00
 */
export function tolerance(
  amount: Kobo,
  factor = 0.0001,
  minToleranceKobo = 100,
): Kobo {
  return Math.max(minToleranceKobo, Math.round(amount * factor));
}

/**
 * Compare two kobo amounts within tolerance. Returns:
 *   negative if a < b - T
 *   zero     if |a - b| ≤ T
 *   positive if a > b + T
 */
export function compareKobo(
  a: Kobo,
  b: Kobo,
  tol: Kobo,
): number {
  const diff = a - b;
  if (Math.abs(diff) <= tol) return 0;
  return diff < 0 ? -1 : 1;
}

/**
 * Sum an array of kobo amounts. Returns 0 for empty arrays.
 */
export function sumKobo(amounts: Kobo[]): Kobo {
  return amounts.reduce((acc, x) => acc + x, 0);
}
