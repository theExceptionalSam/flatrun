# Definition of Done

> **Status:** Approved.
> **Source of truth:** `/docs/product-brief.md` Section 26 (Definition of Done).

---

## 1. The 16-Point Definition of Done

The MVP is complete only when a real user can:

1. Sign up.
2. Create an organisation.
3. Upload CSV/XLSX portfolio data.
4. Map the data.
5. Validate it.
6. Successfully import it.
7. Run reconciliation.
8. Receive reliable results.
9. See detected discrepancies.
10. Open an exception.
11. Understand the reason for the exception.
12. Inspect the evidence.
13. Assign or investigate it.
14. Resolve or dismiss it.
15. Record the resolution.
16. Return later and see the updated state.

The system must handle bad data, duplicates, missing data and failed processing without corrupting financial records.

The MVP must work end-to-end using realistic test data.

---

## 2. DoD Maps to E2E Tests

Each of the 16 points becomes one or more Playwright E2E tests:

| # | DoD point | E2E test name |
|---|---|---|
| 1 | Sign up | `e2e/signup.spec.ts → "user can sign up with email and password"` |
| 2 | Create organisation | `e2e/onboarding.spec.ts → "new user creates first organisation"` |
| 3 | Upload CSV/XLSX | `e2e/upload.spec.ts → "user uploads properties CSV"` + `"user uploads leases XLSX"` |
| 4 | Map the data | `e2e/mapping.spec.ts → "user maps detected columns to canonical fields"` |
| 5 | Validate it | `e2e/validation.spec.ts → "validation reports invalid rows with reasons"` |
| 6 | Successfully import it | `e2e/import.spec.ts → "valid rows import successfully"` + `"invalid rows are retained, not dropped"` |
| 7 | Run reconciliation | `e2e/reconciliation.spec.ts → "user triggers reconciliation and run completes"` |
| 8 | Receive reliable results | `e2e/reconciliation.spec.ts → "reconciliation results match expected planted discrepancies"` |
| 9 | See detected discrepancies | `e2e/dashboard.spec.ts → "dashboard shows total variance and exception counts"` |
| 10 | Open an exception | `e2e/exceptions.spec.ts → "user opens an exception from the list"` |
| 11 | Understand the reason | `e2e/exception-detail.spec.ts → "exception detail shows deterministic explanation"` |
| 12 | Inspect the evidence | `e2e/exception-detail.spec.ts → "exception detail shows source records"` |
| 13 | Assign or investigate | `e2e/exception-detail.spec.ts → "user assigns exception and changes status to investigating"` |
| 14 | Resolve or dismiss | `e2e/exception-detail.spec.ts → "user resolves exception with reason"` + `"user dismisses exception with reason"` |
| 15 | Record the resolution | `e2e/exception-detail.spec.ts → "resolution reason and notes are persisted"` |
| 16 | Return later and see updated state | `e2e/persistence.spec.ts → "user logs out, logs in, sees persisted exception states"` |

---

## 3. Robustness Tests (separate from DoD)

The DoD also requires the system to handle bad data, duplicates, missing data, and failed processing without corrupting financial records. These are tested at the unit and integration level:

| Robustness requirement | Test layer | Test name |
|---|---|---|
| Bad data does not corrupt financial records | Integration | `import/import.spec.ts → "invalid rows do not affect valid rows"` |
| Duplicates do not corrupt financial records | Integration | `import/import.spec.ts → "duplicate external_id upserts, does not duplicate"` |
| Missing data does not corrupt financial records | Unit (engine) | `engine/missing-billing.spec.ts → "missing invoice produces exception, not a crash"` |
| Failed processing does not corrupt financial records | Integration | `import/import.spec.ts → "failed import rolls back all writes"` |
| Cross-org access is blocked | Integration + E2E | `security/isolation.spec.ts → "org A user cannot read org B data"` |
| Concurrent reconciliation runs | Integration | `reconciliation/concurrency.spec.ts → "second run on same scope is queued"` |
| Idempotency on retries | Integration | `api/idempotency.spec.ts → "replayed request returns original response"` |

---

## 4. Edge Case Test Matrix

Every edge case in `edge-cases.md` Section 1 (brief-mandated) and Section 2 (planning-identified) has at least one test. The full mapping is maintained as a checklist in `tests/edge-cases.checklist.md` (created during Slice 8 — Hardening).

The rule: **if an edge case is in `edge-cases.md`, it must have a test.** No exceptions. If the test doesn't exist, the edge case is unimplemented.

---

## 5. Performance Tests

| Test | Target |
|---|---|
| Engine: 5,000 leases, 50,000 invoices, 50,000 payments | Reconciles in < 60 seconds on a single worker |
| Import: 100,000-row CSV | Imports in < 2 minutes |
| API: dashboard page load with 10,000 exceptions | First paint in < 500ms, fully loaded in < 2s |
| API: exception list page with 10,000 exceptions | First page (50 rows) returned in < 200ms |

Performance tests run nightly on CI, not on every PR (they're slow).

---

## 6. Security Tests

| Test | Target |
|---|---|
| Cross-org read attempted via direct API | 403 returned, attempt logged |
| Cross-org write attempted via direct API | 403 returned, attempt logged |
| RLS bypass attempted via DB-level query | Rejected by Postgres |
| Brute force login (100 attempts in 1 minute) | Rate limited (429) |
| File upload of malicious type | Rejected at upload |
| Path traversal in filename | Sanitised, no traversal possible |

---

## 7. Acceptance Criteria Per Slice

Each slice in `build-slices.md` has its own acceptance criteria. A slice is "done" when:

* All slice-specific tests pass.
* All relevant edge case tests pass.
* The slice's E2E tests pass.
* Code review has been done (in our case: a self-review pass against the brief).
* Documentation has been updated (architecture decisions, new patterns).
* Commit has been made with a descriptive message.
* Worklog entry has been added to `/home/z/my-project/worklog.md`.

A slice is NOT done just because the code "seems to work." It is done when the tests prove it works.

---

## 8. Final Acceptance (Slice 8 — Hardening)

The MVP is declared complete only when:

1. All 16 DoD E2E tests pass on staging.
2. All robustness tests pass.
3. All edge case tests pass.
4. Performance tests meet targets.
5. Security tests pass.
6. The app runs unattended on staging for 24 hours without errors.
7. Backup and restore have been verified.
8. The realistic test dataset (Tenant A-F pattern) has been loaded, reconciled, and the report matches expected discrepancies.
9. The worklog records the completion with the full slice-by-slice build history.

At that point, and only at that point, the MVP is "done."

---

## 9. What "Done" Does NOT Mean

* "Done" does not mean "all features in the brief." The brief explicitly lists features NOT to build (Section 23). Those remain unbuilt.
* "Done" does not mean "no bugs." It means "no known bugs that violate the DoD or corrupt data."
* "Done" does not mean "production-ready for a real customer." That requires a customer onboarding flow, legal review, security audit, and a paid deployment. The MVP is "ready to onboard the first pilot customer."
* "Done" does not mean "the engine is perfect." It means "the engine reliably detects the six exception types on realistic data, with confidence ratings and evidence." False positives are expected and the user has a Dismiss path.
