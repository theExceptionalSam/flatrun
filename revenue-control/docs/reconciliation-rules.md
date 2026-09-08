# Reconciliation Rules — Deterministic Specification

> **Status:** Approved plan. The engine is the crown jewel. If this is wrong, the product is wrong.
> **Source of truth:** `/docs/product-brief.md` Section 8 (Engine principle) and Section 9 (Exception types).

---

## 1. Engine Principle

The engine is a **pure function**:

```typescript
engine.run({
  leases:   NormalisedLease[],
  invoices: NormalisedInvoice[],
  payments: NormalisedPayment[],
  asOf:     Date,
  config?:  EngineConfig
}): EngineResult

type EngineResult = {
  exceptions: ExceptionDraft[],
  evidence:   Map<exceptionId, SourceRecords>,
  unmatched:  { invoices: InvoiceId[], payments: PaymentId[] }
}
```

* No database calls. No I/O. No NestJS. No AI.
* All money is decimal. All comparisons use an explicit tolerance.
* All math is testable in isolation. Golden dataset tests verify the engine against known inputs.
* The engine is invoked from the `reconciliation` NestJS module (which loads records, calls the engine, and persists results transactionally).

---

## 2. Common Definitions

### Tolerance
```
T(amount) = max(1.00, amount × 0.0001)
```
A discrepancy is flagged only when `|expected − actual| > T(expected)`. This prevents floating-point dust from generating noise.

### Billing period
Derived from `lease.frequency`:
* `monthly`     → 1st to last day of calendar month
* `quarterly`   → 3-month windows starting from `lease.start_date`
* `semi_annual` → 6-month windows starting from `lease.start_date`
* `annual`      → 12-month windows starting from `lease.start_date`

### Lease active for a period
```
lease.start_date ≤ period.start
  AND (lease.end_date IS NULL OR period.start ≤ lease.end_date)
```

### Expected amount for a period
```
expected_amount = base_rent × escalation_multiplier(step)
where step = number of escalation anniversaries that have passed as of period.start
```

### Escalation math

For `escalation_type = 'percentage'`:
```
years_elapsed = floor((period.start − escalation_start_date) / 365)
steps = floor((years_elapsed × 12) / escalation_frequency_months)
expected = rent_amount × (1 + escalation_rate) ^ steps
```

For `escalation_type = 'fixed_amount'`:
```
expected = rent_amount + (escalation_rate × steps)
```

For `escalation_type = 'none'`:
```
expected = rent_amount  (always)
```

### Payment-to-invoice matching (deterministic, runs once before Rules 3 & 4)

1. **Exact link.** `payment.invoice_id == invoice.id` → matched.
2. **Reference match.** `payment.tenant_id == invoice.tenant_id AND payment.payment_reference == invoice.external_id` → matched.
3. **Amount + date proximity.** `payment.tenant_id == invoice.tenant_id AND |payment.amount − invoice.amount| ≤ T(invoice.amount) AND |payment.payment_date − invoice.invoice_date| ≤ 60 days` → matched (confidence 0.80).

Allocation order: **FIFO within a tenant**. A payment is allocated to the oldest matching open invoice first. Partial allocations are recorded (one payment can match multiple invoices).

A single payment can split across multiple invoices if it overpays one — only if the rules above allow that match. Otherwise the remainder is held as unallocated.

---

## 3. The Six Rules

### Rule 1 — Underbilling

**Trigger.**
For an active lease and a closed billing period:
```
sum(invoices for lease & period) < expected_amount − T(expected_amount)
```

**Inputs.** Lease, period, invoices matched to `(lease_id, period_start, period_end)`.

**Variance.** `expected_amount − sum(invoices)`

**Severity.**
| Condition | Severity |
|---|---|
| variance ≥ 1 month's expected rent OR variance ≥ ₦1,000,000 | critical |
| variance ≥ 25% of expected | high |
| otherwise | medium |

**Confidence.**
| Match path | Confidence |
|---|---|
| Lease has explicit `lease_id` linkage on invoices | 1.00 |
| Linkage inferred by (tenant + period) | 0.85 |

**Evidence.** Lease row, expected-amount calculation breakdown, all matched invoice rows, period definition.

---

### Rule 2 — Missing billing

**Trigger.**
For an active lease and a closed billing period:
```
count(invoices for lease & period) == 0
```

**Grace window.** Periods whose end date is within the last 7 days are NOT flagged (invoices may still be in flight).

**Variance.** `expected_amount` (full).

**Severity.**
| Condition | Severity |
|---|---|
| period end > 30 days past | critical |
| period end within 0–30 days past | high |
| period end within last 7 days | (not flagged) |
| period is current | medium |

**Confidence.** 0.95 (slight discount because the lease may have been terminated mid-period without us knowing).

**Evidence.** Lease row, expected-amount calculation, the absence-of-invoices assertion (with the period search params used).

---

### Rule 3 — Underpayment

**Trigger.**
An invoice exists with `amount = X`. After deterministic matching:
```
sum(matched payments) < X − T(X)
```

**Inputs.** Invoice, payments matched to it via the matching pass.

**Variance.** `invoice.amount − sum(matched payments)`

**Severity.**
| Condition | Severity |
|---|---|
| variance ≥ ₦5,000,000 OR invoice is > 90 days old | critical |
| variance ≥ 25% of invoice amount | high |
| otherwise | medium |

**Confidence.**
| Match path | Confidence |
|---|---|
| Rule 1 or Rule 2 match (exact link or reference) | 1.00 |
| Rule 3 match (amount + date proximity) | 0.80 |

**Evidence.** Invoice row, all matched payment rows, allocation breakdown (how each payment was assigned), outstanding balance.

---

### Rule 4 — Unallocated payment

**Trigger.** A payment is flagged unallocated if any of:
1. `payment.tenant_id IS NULL` or references a non-existent tenant.
2. `payment.tenant_id` is known but the tenant has no open invoices.
3. The payment ambiguously matches 2+ invoices (e.g., two invoices with the same amount in the same window) and no `payment_reference` disambiguates.

**Variance.** `payment.amount` (the entire payment is unallocated by definition).

**Severity.**
| Condition | Severity |
|---|---|
| amount ≥ ₦1,000,000 | high |
| otherwise | medium |

**Confidence.**
| Reason | Confidence |
|---|---|
| null/unknown tenant | 0.90 |
| tenant has no open invoices | 0.95 |
| ambiguous multi-match | 0.75 |

**Important.** Ambiguous matches are NOT auto-resolved. The candidate invoices are listed in evidence for human disambiguation. AI may suggest the most likely invoice; the suggestion is never auto-applied.

**Evidence.** Payment row, search/match attempt summary, candidate invoices (if any), the reason the payment was classified as unallocated.

---

### Rule 5 — Missed escalation

**Trigger.**
For an active lease with `escalation_type ≠ 'none'`, for a period after an escalation anniversary:
```
sum(invoices for period) < expected_escalated_amount − T(expected_escalated_amount)
```

**Variance.** `expected_escalated_amount − sum(invoices for period)`

**Severity.**
| Condition | Severity |
|---|---|
| variance accumulates across 2+ consecutive periods | critical |
| single-period variance ≥ 25% of expected | high |
| otherwise | medium |

**Edge case.** If `escalation_type == 'none'` but historical billing shows a sudden jump or drop in amount, that's NOT this rule — it's Rule 6 (anomalous billing).

**Confidence.**
| Source of escalation data | Confidence |
|---|---|
| Explicit in lease row (`escalation_type`, `escalation_rate`, `escalation_start_date`) | 1.00 |
| Inferred from historical billing pattern | 0.70 (we should NOT infer silently for MVP — flag only on explicit lease data) |

**Evidence.** Lease row, escalation clause details, calculation of `expected_escalated_amount`, all invoices for the period, the period definition.

---

### Rule 6 — Duplicate / anomalous billing

Three sub-detections:

#### 6a — Duplicate invoices
**Trigger.**
Two invoices with identical `(tenant_id, lease_id, period_start, period_end, amount)`.

**Variance.** `amount` (the second invoice is the suspected duplicate).

**Severity.** high.

**Confidence.** 0.95.

#### 6b — Near-duplicate invoices
**Trigger.**
Two invoices with same `(tenant_id, period_start, period_end)` but different `amount` within 5% of each other, issued within 7 days.

**Variance.** `|amount1 − amount2|`.

**Severity.** medium.

**Confidence.** 0.80.

#### 6c — Anomalous amount
**Trigger.**
A single invoice whose `amount > 3 × expected_amount` for its period (probable data-entry error or wrong unit).

**Variance.** `amount − expected_amount`.

**Severity.** medium.

**Confidence.** 0.70.

**Important.** Rule 6 generates exceptions but **never suppresses the underlying invoices**. The user decides whether the duplicate is real or a legitimate supplementary invoice.

---

## 4. Engine Orchestration

Rules run in a fixed order:

```
1. Build MatchingContext (payment-to-invoice allocations, shared by Rules 3 & 4)
2. Rule 6 (duplicates & anomalies)  — may mark invoices as suspect
3. Rule 2 (missing billing)
4. Rule 1 (underbilling)
5. Rule 5 (missed escalation)
6. Rule 3 (underpayment)            — uses MatchingContext
7. Rule 4 (unallocated payment)    — uses MatchingContext
```

The order matters:
* Rule 6 first because suspected duplicates change which invoices count for the other rules.
* Rules 2, 1, 5 run before Rules 3, 4 because they define "what was expected" before we evaluate "what was collected".
* Rules 3 and 4 share the matching pass, so they run adjacent.

Rules do NOT call each other. They share a `MatchingContext` built once at the top of the run.

---

## 5. What AI Does NOT Touch

For the avoidance of doubt, the engine NEVER calls AI for:
* Computing expected rent
* Computing escalations
* Computing variances
* Matching payments to invoices (deterministic only; AI may *suggest* later, never decide)
* Setting severity
* Setting confidence (deterministic confidence is computed by the rule; AI does not modify it)
* Generating the `explanation` field (deterministic text is generated from a template; AI generates the optional `ai_explanation` separately and clearly labelled)

---

## 6. Engine Output Shape

```typescript
type ExceptionDraft = {
  exception_type:    ExceptionType,
  severity:          Severity,
  financial_variance: Decimal,
  currency:          string,
  tenant_id:         UUID | null,
  property_id:       UUID | null,
  lease_id:          UUID | null,
  source_records:    SourceRecords,
  explanation:       string,        // deterministic, always present
  confidence:        number,         // 0.00 to 1.00
}

type SourceRecords = {
  lease?:    LeaseRecord,
  invoices?: InvoiceRecord[],
  payments?: PaymentRecord[],
  evidence_explanation: string,    // why we believe this exception is real
}
```

The `reconciliation` module takes these drafts, attaches `organisation_id` and `reconciliation_run_id`, and persists them as rows in `exceptions`.

---

## 7. Deterministic Explanation Template

Every exception's `explanation` is generated from a template, not from an LLM:

```
[Underbilling] Tenant {tenant_name} (lease {lease_external_id}) was expected to be billed
{currency} {expected_amount} for the period {period_start} to {period_end}, but invoices
summed to {currency} {actual_amount}, resulting in a variance of {currency} {variance}.
Confidence: {confidence}. Source: {n} invoices reviewed.
```

Identical templates exist for each exception type. These templates are versioned in `packages/reconciliation-engine/src/templates.ts` and any change is a schema migration (the `explanation` text in historical exceptions is preserved as-is; new exceptions get the new template).

---

## 8. Testing Discipline

* Each rule has its own test file with: trigger-met, trigger-not-met, boundary (exactly at tolerance), zero, negative, null cases.
* Three golden datasets (small, medium, stress) committed to `packages/reconciliation-engine/test/fixtures/`.
* Property-based test: for any lease with `escalation_type='percentage'`, the expected amount is monotonic non-decreasing across periods.
* Decimal arithmetic tests asserting we never use floating point.
* The "first real milestone" (see `build-slices.md`) is the engine + a CLI that produces a reconciliation report from five CSVs. If the report matches the planted discrepancies in the fixtures, the engine works. If it doesn't, no UI gets built.
