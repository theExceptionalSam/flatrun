/**
 * Rule 5 — Missed Escalation
 *
 * Trigger:
 *   For an active lease with escalation_type ≠ 'none', for a period after
 *   an escalation anniversary:
 *   sum(invoices for period) < expected_escalated_amount − T(expected_escalated_amount)
 *
 * Variance:
 *   expected_escalated − sum(invoices for period)
 *
 * Severity:
 *   critical  if variance accumulates across 2+ consecutive periods
 *   high      if single-period variance ≥ 25% of expected
 *   medium    otherwise
 *
 * Confidence:
 *   1.00  if escalation clause is explicit in lease row
 *   0.70  if escalation was inferred from historical billing pattern
 *         (we do NOT infer silently for the MVP — flag only on explicit data)
 *
 * Source of truth: /docs/reconciliation-rules.md Section 3 Rule 5
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
import { explainMissedEscalation } from '../templates.js';
import { groupInvoicesByPeriod } from './underbilling.js';

/**
 * Returns the set of period start dates where Rule 5 fired, so Rule 1 can be
 * suppressed for those periods (escalation is the more specific explanation).
 */
export function detectMissedEscalation(
  lease: NormalisedLease,
  invoices: NormalisedInvoice[],
): { drafts: ExceptionDraft[]; firedPeriods: Set<string> } {
  const drafts: ExceptionDraft[] = [];
  const firedPeriods = new Set<string>();

  if (lease.escalationType === 'none') {
    return { drafts, firedPeriods };
  }
  if (!lease.escalationStartDate || !lease.escalationFrequencyMonths || lease.escalationRate == null) {
    return { drafts, firedPeriods };
  }

  const periodGroups = groupInvoicesByPeriod(lease, invoices);

  // Track consecutive periods where escalation was missed.
  let consecutiveMissed = 0;
  // Sort by period start
  periodGroups.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  for (const group of periodGroups) {
    // Only check periods on or after escalation_start_date.
    if (group.periodStart < lease.escalationStartDate) {
      consecutiveMissed = 0;
      continue;
    }

    const expected = expectedRentForPeriod(lease, group.periodStart);
    const tol = tolerance(expected);
    const actual = sumKobo(group.invoices.map(i => i.amount));
    const cmp = compareKobo(actual, expected, tol);

    if (cmp >= 0) {
      // Billing reflects escalation. Reset consecutive counter.
      consecutiveMissed = 0;
      continue;
    }

    // Variance detected.
    const variance = expected - actual;
    consecutiveMissed++;
    const severity = computeSeverity(variance, expected, consecutiveMissed);
    const confidence = 1.00; // explicit escalation clause

    firedPeriods.add(group.periodStart);

    drafts.push({
      exception_type: 'missed_escalation',
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
        evidence_explanation: `Missed escalation for period ${group.periodStart} to ${group.periodEnd}: expected ${lease.currency} ${expected} kobo (after escalation), billed ${actual} kobo, variance ${variance} kobo.`,
      },
      explanation: explainMissedEscalation({
        lease,
        periodStart: group.periodStart,
        periodEnd: group.periodEnd,
        expected,
        actual,
        variance,
        currency: lease.currency,
        confidence,
        matchedInvoices: group.invoices,
        matchedPayments: [],
        evidenceSummary: '',
      }),
      confidence,
    });
  }

  return { drafts, firedPeriods };
}

function computeSeverity(
  variance: Kobo,
  expected: Kobo,
  consecutiveMissed: number,
): Severity {
  if (consecutiveMissed >= 2) return 'critical';
  if (variance >= Math.round(expected * 0.25)) return 'high';
  return 'medium';
}
