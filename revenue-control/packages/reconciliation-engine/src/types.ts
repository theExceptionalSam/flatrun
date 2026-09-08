/**
 * Core domain types for the reconciliation engine.
 *
 * The engine is pure: it accepts normalised records and returns exception drafts.
 * No I/O, no database, no NestJS, no AI.
 *
 * Money is represented as integer kobo (1 NGN = 100 kobo) to avoid floating-point
 * errors. See `./decimal.ts` for the rationale and helpers.
 *
 * Source of truth: /docs/reconciliation-rules.md
 */

// ============================================================================
// Money
// ============================================================================

/**
 * Money amount, in integer kobo (1 NGN = 100 kobo).
 *
 * Why integer kobo:
 *  - Floating-point arithmetic produces dust (e.g., 0.1 + 0.2 = 0.30000000000000004).
 *  - The brief explicitly requires deterministic financial calculations.
 *  - Integer math is exact for any amount up to ~92 trillion NGN (Number.MAX_SAFE_INTEGER / 100).
 *
 * Conversion happens only at the I/O boundary (CSV parsing, report formatting).
 */
export type Kobo = number;

export type Currency = string; // ISO 4217, e.g., "NGN"


// ============================================================================
// Identifiers
// ============================================================================

export type UUID = string;
export type ExternalId = string;


// ============================================================================
// Normalised input records (what the engine consumes)
// ============================================================================

export type LeaseFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type EscalationType = 'none' | 'percentage' | 'fixed_amount';
export type BillingType = 'rent' | 'service_charge' | 'other';

/**
 * A lease, normalised from the raw upload.
 */
export interface NormalisedLease {
  id: UUID;
  externalId: ExternalId;
  tenantId: UUID;
  tenantExternalId: ExternalId;
  propertyId: UUID;
  propertyExternalId: ExternalId;
  startDate: string;       // ISO 8601 date (YYYY-MM-DD)
  endDate: string | null;  // null = open-ended
  rentAmount: Kobo;
  currency: Currency;
  frequency: LeaseFrequency;
  escalationType: EscalationType;
  escalationRate: number | null;        // percentage as 0.05 for 5%; kobo amount for fixed_amount
  escalationFrequencyMonths: number | null;
  escalationStartDate: string | null;
  // Preserved raw row for evidence
  raw: Record<string, unknown>;
}

export interface NormalisedTenant {
  id: UUID;
  externalId: ExternalId;
  name: string;
  propertyId: UUID | null;
  raw: Record<string, unknown>;
}

export interface NormalisedProperty {
  id: UUID;
  externalId: ExternalId;
  name: string;
  raw: Record<string, unknown>;
}

export interface NormalisedInvoice {
  id: UUID;
  externalId: ExternalId;
  tenantId: UUID | null;
  tenantExternalId: string | null;
  leaseId: UUID | null;       // may be inferred
  invoiceDate: string;        // ISO date
  amount: Kobo;
  currency: Currency;
  billingType: BillingType;
  raw: Record<string, unknown>;
}

export interface NormalisedPayment {
  id: UUID;
  externalId: ExternalId;
  tenantId: UUID | null;
  tenantExternalId: string | null;
  invoiceId: UUID | null;     // may be set if payment.external_id matches an invoice
  paymentDate: string;
  amount: Kobo;
  currency: Currency;
  paymentReference: string | null;
  raw: Record<string, unknown>;
}


// ============================================================================
// Engine output
// ============================================================================

export type ExceptionType =
  | 'underbilling'
  | 'missing_billing'
  | 'underpayment'
  | 'unallocated_payment'
  | 'missed_escalation'
  | 'duplicate_anomalous_billing';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = number; // 0.00 to 1.00

export interface SourceRecordRef {
  kind: 'lease' | 'invoice' | 'payment' | 'tenant' | 'property';
  id: UUID;
  externalId?: ExternalId;
  snapshot: Record<string, unknown>;
}

export interface SourceRecords {
  lease?: SourceRecordRef;
  invoices?: SourceRecordRef[];
  payments?: SourceRecordRef[];
  evidence_explanation: string;  // human-readable summary of why we believe this exception
}

/**
 * A draft exception produced by the engine. The Reconciliation Module will
 * attach organisation_id and reconciliation_run_id before persisting.
 */
export interface ExceptionDraft {
  exception_type: ExceptionType;
  severity: Severity;
  financial_variance: Kobo;
  currency: Currency;
  tenant_id: UUID | null;
  tenant_external_id: ExternalId | null;
  property_id: UUID | null;
  property_external_id: ExternalId | null;
  lease_id: UUID | null;
  lease_external_id: ExternalId | null;
  source_records: SourceRecords;
  explanation: string;     // deterministic, always present
  confidence: Confidence;
  // Sub-type for Rule 6 (duplicate vs anomalous vs near-duplicate)
  sub_type?: 'duplicate' | 'near_duplicate' | 'anomalous_amount';
}

export interface EngineResult {
  exceptions: ExceptionDraft[];
  unmatched: {
    invoices: UUID[];
    payments: UUID[];
  };
  summary: {
    expected_revenue: Kobo;
    billed_revenue: Kobo;
    collected_revenue: Kobo;
    counts_by_type: Record<ExceptionType, number>;
    total_variance: Kobo;
  };
}

export interface EngineConfig {
  /** Tolerance factor. A discrepancy is flagged only when |expected - actual| > max(1.00, amount * toleranceFactor). Default 0.0001 (0.01%). */
  toleranceFactor?: number;
  /** Minimum tolerance in kobo. Default 100 (i.e., ₦1.00). */
  minToleranceKobo?: number;
  /** Grace window in days. Periods whose end date is within this many days of `asOf` are not flagged for missing billing. Default 7. */
  missingBillingGraceDays?: number;
  /** Date used to determine "today" for grace windows and active-lease checks. Default: today (UTC). */
  asOf?: string;
}


// ============================================================================
// Internal: matching context
// ============================================================================

/**
 * Result of the deterministic payment-to-invoice matching pass.
 * Built once at the top of an engine run; shared by Rules 3 and 4.
 */
export interface MatchingContext {
  /** For each invoice, the payments allocated to it (in FIFO order). */
  allocationsByInvoice: Map<UUID, Array<{ payment: NormalisedPayment; matchRule: 1 | 2 | 3 }>>;
  /** For each payment, the invoice it was allocated to (if any). */
  allocationByPayment: Map<UUID, { invoice: NormalisedInvoice; matchRule: 1 | 2 | 3 }>;
  /** Payments that could not be allocated. */
  unallocatedPayments: Array<{ payment: NormalisedPayment; reason: UnallocatedReason; candidateInvoiceIds: UUID[] }>;
}

export type UnallocatedReason =
  | 'null_tenant'              // payment.tenant_id is null or unknown
  | 'no_open_invoices'         // tenant has no invoices with outstanding balance
  | 'ambiguous_match'         // payment ambiguously matches 2+ invoices
  | 'no_match';                // no invoice matches any rule
