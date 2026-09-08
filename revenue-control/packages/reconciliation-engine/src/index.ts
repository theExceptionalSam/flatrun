/**
 * Public API for the reconciliation engine.
 *
 * This package is pure — no I/O, no NestJS, no AI, no database.
 * It accepts normalised records and returns exception drafts.
 *
 * The reconciliation module (in apps/api) loads records from the database,
 * normalises them, calls runReconciliation(), and persists the results.
 */

export { runReconciliation } from './engine.js';
export type { EngineInput, EngineResult } from './engine.js';

export type {
  Kobo,
  Currency,
  UUID,
  ExternalId,
  LeaseFrequency,
  EscalationType,
  BillingType,
  NormalisedLease,
  NormalisedTenant,
  NormalisedProperty,
  NormalisedInvoice,
  NormalisedPayment,
  ExceptionType,
  Severity,
  Confidence,
  SourceRecordRef,
  SourceRecords,
  ExceptionDraft,
  EngineConfig,
  MatchingContext,
  UnallocatedReason,
} from './types.js';

export {
  nairaToKobo,
  koboToNaira,
  formatNaira,
  tolerance,
  compareKobo,
  sumKobo,
} from './decimal.js';

export {
  parseDate,
  formatDate,
  daysBetween,
  periodContaining,
  isLeaseActiveForPeriod,
  addDays,
  addMonths,
  periodLengthMonths,
  periodContains,
  lastDayOfMonth,
} from './period.js';
export type { Period } from './period.js';

export {
  expectedRentForDate,
  expectedRentForPeriod,
  escalationSteps,
} from './escalation.js';
