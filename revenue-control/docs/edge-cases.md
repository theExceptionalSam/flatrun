# Edge Cases

> **Status:** Approved.
> **Source of truth:** `/docs/product-brief.md` Section 17 (Edge cases).

---

## 1. Edge Case Treatment Table

| Case | Treatment |
|---|---|
| **No data uploaded yet** | Dashboard shows a guided empty state ("Upload your first dataset"). No zero-value analytics. |
| **Missing required fields** | Validation rejects the row; row held in `import_jobs.invalid_records` with a per-row reason. User can fix and re-upload just those rows. |
| **Duplicate records (within a file)** | Detected by `(external_id, organisation_id)` uniqueness. Second occurrence held in `invalid_records` with reason `"duplicate_external_id"`. |
| **Duplicate records (across files)** | Treated as an upsert: a re-upload of the same `external_id` updates the existing row, preserving referential integrity. Audit log records the update. |
| **Invalid data types** | Mapping UI prevents mapping a text column to a numeric field. If a row has a value that cannot be coerced, that row goes to `invalid_records`. |
| **Conflicting records** (e.g., two leases for same tenant+property with overlapping dates) | Both are stored. A system warning is added to `import_jobs.validation_report` (NOT an exception — the 6 MVP exception types don't include this). User is asked to resolve in mapping. |
| **Unmatched payment** | Goes to Rule 4 (Unallocated payment) → exception with all candidate invoices listed. |
| **Partial import** | Valid rows imported, invalid rows held separately. Import job status = `partial`. User sees counts clearly. |
| **Failed processing (mid-import)** | Transaction per dataset; on failure, the import job is rolled back and can be retried. No partial state persists. |
| **Failed reconciliation run** | `reconciliation_runs.status = failed` with error message. Existing exceptions are NOT modified. User can re-trigger. |
| **API failure** (future integrations) | Not relevant for MVP (file upload only). The schema has `data_sources.status` and `last_synced_at` ready for this. |
| **Duplicate API events** | Idempotency keys on every mutating endpoint. Replayed requests return the original response. |
| **False positive exception** | User dismisses with reason. The dismissal is audited. The exception is NOT deleted — it remains in the historical record with status `dismissed`. |

---

## 2. Additional Edge Cases Identified During Planning

These are not in the brief's explicit list but are necessary to handle:

| Case | Treatment |
|---|---|
| **Currency mismatch** (lease in USD, invoice in NGN) | For MVP: detected at validation, flagged as `invalid_record` with reason `"currency_mismatch"`. Cross-currency reconciliation is a later phase. |
| **Lease with no end date** | Treated as ongoing; periods computed up to `asOf` date. |
| **Lease with `start_date` in the future** | Status `future`; not reconciled until active. |
| **Backdated uploads** | Reconciliation uses `invoice_date` and `payment_date`, not upload timestamps. Historical periods can be re-reconciled. |
| **Very large files** (>100k rows) | Streamed parsing (not loaded into memory); chunked inserts; background job with progress reporting. |
| **Concurrent reconciliation runs on same scope** | Database-level advisory lock on `(organisation_id, scope_hash)`. Second run is rejected or queued. |
| **User leaves org mid-investigation** | Their assigned exceptions are auto-unassigned with an audit entry. No data loss. |
| **Tenant appears in invoices/payments but not in tenants file** | Validation error during import of invoices/payments: `"referential_integrity_missing_tenant"`. Row held in `invalid_records`. User must upload tenants first or include the tenant in this file (auto-create tenant stub with `external_id` only — provisional, must be confirmed by user). |
| **Lease amount is zero or negative** | Validation rejects. Reason `"invalid_rent_amount"`. |
| **Invoice amount is zero** | Stored (legitimate for credit notes), but flagged for review. |
| **Invoice amount is negative** | Stored as a credit note. Engine does not generate underbilling exceptions for credit notes (the credit reduces billed total legitimately). |
| **Payment amount is zero** | Validation rejects. Reason `"invalid_payment_amount"`. |
| **Payment amount is negative** | Treated as a refund. Refunds can match invoices (reduce the outstanding balance). |
| **Duplicate file upload** (same file uploaded twice) | Two `data_sources` rows. Each can be imported independently. If imported, second import is an upsert by `external_id`. |
| **User uploads wrong dataset type** (e.g., uploads leases as "billing") | Mapping UI shows detected columns vs canonical fields for that dataset. If the user proceeds, validation will reject most rows because canonical fields don't match. Import will be `partial` or `failed`. |
| **Time zone in dates** | All dates stored as `DATE` (no time component) for leases, invoices, payments. The brief's datasets only have dates, not timestamps. If a datetime arrives, only the date part is used. |
| **Multiple currencies in one org** | Stored as-is. Reconciliation is per-currency (a lease in USD reconciled against USD invoices only). Mixed-currency reconciliation is a later phase. |
| **Reconciliation run on an org with no leases** | Run completes immediately with 0 exceptions. Run summary shows `0 records processed`. |
| **Reconciliation run on an org with leases but no invoices/payments** | Run produces missing-billing exceptions for every active lease/period. This is correct behaviour — it tells the user they have leases but no billing records. |
| **Empty CSV file** (header only, no rows) | Validation accepts; import succeeds with 0 rows. Import status = `completed` with `row_count_total = 0`. |
| **CSV with no header row** | Column detection fails. Import job status = `failed` with error `"could_not_detect_columns"`. User must re-upload with headers. |
| **Malformed CSV** (unmatched quotes, etc.) | Parser error caught; import job status = `failed` with parser error message. No partial state. |

---

## 3. Engine-Specific Edge Cases

These are handled inside `packages/reconciliation-engine`:

| Case | Treatment |
|---|---|
| **Tolerance boundary** (variance exactly equals tolerance) | Not flagged. The check is `variance > T`, not `variance ≥ T`. |
| **Multiple escalations in one period** (anniversary falls mid-period) | For MVP: escalation applies from the period containing the anniversary. Mid-period escalation is a later refinement. |
| **Payment that overpays one invoice and could partially pay another** | Allocation order is FIFO. Remainder after the first invoice is held as unallocated (Rule 4). |
| **Invoice with no `lease_id` but `tenant_id` matches a tenant with multiple leases** | Engine attempts to infer lease by (tenant, period overlap). If ambiguous, the invoice is reconciled against the most recent active lease for that tenant. The confidence is reduced to 0.85. |
| **Payment with `tenant_id` matching multiple tenants with same external_id in different orgs** | Cannot happen — `external_id` is unique within `(organisation_id, external_id)` per the schema. |
| **Lease with `start_date > end_date`** | Validation rejects. Reason `"invalid_lease_dates"`. |
| **Lease with `end_date` in the past but status `active`** | Engine uses `end_date` for period computation, not `status`. Status mismatch is logged as a warning. |

---

## 4. Security-Related Edge Cases

| Case | Treatment |
|---|---|
| **JWT expired mid-session** | Refresh token exchange happens silently; user does not see an error unless refresh also fails. |
| **User attempts to access another org's data via direct API call** | 403 returned; attempt logged to audit log; if repeated, account is rate-limited. |
| **User uploads a file disguised as CSV but is actually malicious** | Magic-byte verification at upload; rejected with `"invalid_file_format"`. |
| **User uploads a file with path traversal in filename** | Filenames are sanitised; the S3 key is generated by the app, not derived from the user's filename. |
| **User attempts to escalate role via API** | Role changes require `owner` role on the target org and are audited. A `viewer` cannot change their own role. |
| **Replay of an old request with the same idempotency key but different body** | Idempotency layer returns the original response. The new body is ignored. |

---

## 5. Testing the Edge Cases

Every edge case above maps to at least one test in the test suite. The mapping is maintained in `definition-of-done.md` Section 6 (Edge case test matrix).
