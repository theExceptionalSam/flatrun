# Build Slices — Vertical Execution Plan

> **Status:** Approved.
> **Source of truth:** `/docs/product-brief.md` Section 28 (Build order) + the operating protocol in `operating-protocol.md`.

---

## 1. Why Vertical Slices (not horizontal phases)

The brief specifies 13 phases (Section 28) which describe **what** to build in what order. The slices below describe **how** we ship working software in increments.

A horizontal phase plan builds all the DB, then all the API, then all the UI. The problem: nothing is demonstrable until everything is done. Bugs hide. The engine doesn't get tested against real data until late.

A vertical slice plan builds end-to-end through the stack. Each slice is a working product increment. The engine gets exercised against real CSVs early. Bad assumptions surface fast.

We follow the brief's build order *within* each slice, but we ship slices, not layers.

---

## 2. The Slice Order

```
Slice 0 — Foundation
   ↓
Slice 1 — Signup → Organisation → Empty Dashboard
   ↓
Slice 2 — THE ENGINE: 5 CSVs → Reconciliation Report (CLI, no UI yet)
   ↓                ← This is the first real milestone.
   ↓                  If this fails, no UI gets built.
Slice 3 — Upload CSV → Map → Validate → Import (UI + API + workers)
   ↓
Slice 4 — Engine wired into API → Reconciliation Run → Dashboard + Exception List + Detail
   ↓
Slice 5 — Resolution Workflow + Audit
   ↓
Slice 6 — AI Explanation Layer (lazy, optional)
   ↓
Slice 7 — Production Hardening + DoD verification
```

---

## 3. Slice 0 — Foundation

**Goal:** A reproducible dev environment that everyone can run. No product features yet.

**Builds:**
* pnpm workspace + turbo config
* TypeScript config (strict mode)
* ESLint + Prettier
* `apps/web` (Next.js 14 App Router skeleton)
* `apps/api` (NestJS skeleton)
* `packages/shared` (zod schemas, types, enums)
* `packages/reconciliation-engine` (empty pure package)
* Docker compose: Postgres, Redis, MinIO (S3-compatible)
* CI pipeline: lint, typecheck, unit tests, build
* `/health` and `/health/ready` endpoints on the API
* `/docs` committed (this folder)

**Acceptance criteria:**
* `pnpm dev` brings up web + api + db + redis + minio
* `curl http://localhost:3000/health` returns 200
* `curl http://localhost:3001/health/ready` returns 200 with all components healthy
* `pnpm test` runs all unit tests (currently trivial)
* `pnpm lint` and `pnpm typecheck` pass clean
* CI pipeline green on a sample PR

**Brief phases covered:** Phase 1 (Project foundation).

---

## 4. Slice 1 — Signup → Organisation → Empty Dashboard

**Goal:** Multi-tenancy works end-to-end. A user can sign up, create an org, and land on a dashboard with a proper empty state.

**Builds:**
* Auth integration (Clerk or Auth0 — pending Q3 answer)
* `auth` module: signup, login, JWT verification
* `organisation` module: create org, list my orgs, membership
* Invite flow: owner can invite a second user with a role
* RBAC: `@Roles()` decorator + `RolesGuard`
* `OrgMemberGuard` for tenant isolation
* RLS policies on `organisations`, `users`, `organisation_memberships`
* `audit_logs` table + audit interceptor on mutations
* Dashboard page (Next.js) with empty state ("Upload your first dataset")
* Login, signup, organisation-onboarding pages

**Acceptance criteria:**
* Two users in two orgs cannot read each other's data via API (explicit test)
* RLS test confirms cross-org queries blocked even when application filters are bypassed
* Invite flow: second user receives invite, accepts, joins org with correct role
* Dashboard empty state shows the right call-to-action
* All auth-related audit logs are written
* E2E: signup → create org → invite second user → second user joins

**Brief phases covered:** Phase 2 (Authentication + organisation), partial Phase 3 (DB + data model — auth/identity tables), partial Phase 11 (Audit logging — basic).

---

## 5. Slice 2 — THE ENGINE: 5 CSVs → Reconciliation Report

> **This is the first real milestone.** No UI is built for upload yet. The engine + a CLI are demonstrable independently. If this fails, the rest of the product doesn't matter.

**Goal:** Prove the reconciliation engine works against realistic data with planted discrepancies.

**Builds:**
* `packages/reconciliation-engine` complete:
  * All 6 rules (underbilling, missing billing, underpayment, unallocated payment, missed escalation, duplicate/anomalous billing)
  * Escalation math
  * Period math
  * Payment-to-invoice matching (deterministic, FIFO allocation)
  * Tolerance handling
  * Severity calculation
  * Confidence calculation
  * Deterministic explanation templates
* Realistic test fixtures in `packages/reconciliation-engine/test/fixtures/`:
  * `properties.csv`, `tenants.csv`, `leases.csv`, `billing.csv`, `payments.csv`
  * Planted discrepancies:
    * Tenant A: clean (no exceptions)
    * Tenant B: underbilling (one period underbilled)
    * Tenant C: missed escalation (escalation anniversary passed, billing didn't update)
    * Tenant D: underpayment (invoice partially paid)
    * Tenant E: unallocated payment (payment with no clear invoice match)
    * Tenant F: duplicate invoice (two invoices for same period/amount)
  * Plus: a clean subset of 50 leases with no exceptions (control)
  * Plus: a stress subset of 5,000 leases / 50,000 invoices / 50,000 payments for performance
* A CLI script: `pnpm reconcile <fixtures-dir>` that loads the 5 CSVs, runs the engine, and prints a report
* Full unit tests for each rule
* Golden dataset tests: small, medium, stress
* Property-based test for escalation monotonicity
* Decimal arithmetic tests

**Acceptance criteria:**
* `pnpm reconcile fixtures/small` produces a report that matches the planted discrepancies exactly (Tenant A: 0 exceptions; B: 1 underbilling; C: 1 missed escalation; D: 1 underpayment; E: 1 unallocated payment; F: 1 duplicate)
* All rule unit tests pass (trigger-met, trigger-not-met, boundary, zero, negative, null)
* Engine performance: stress fixture (5k leases / 50k invoices / 50k payments) reconciles in < 60 seconds
* No floating-point errors in any variance calculation
* Engine has zero runtime dependencies on NestJS, DB, or I/O — pure package

**Brief phases covered:** Phase 6 (Reconciliation engine). The CLI is a thin wrapper, not a "screen" per the brief.

**Critical note:** If this slice fails, the rest of the build stops. We do not build UI on top of an engine that doesn't work.

---

## 6. Slice 3 — Upload CSV → Map → Validate → Import

**Goal:** A user can upload all five datasets through the UI, with bad data handled safely.

**Builds:**
* `data-source` module: file upload, S3 storage, streaming CSV/XLSX parse
* `import` module: column auto-detection, mapping UI, validation, partial import, invalid-records retention
* Streaming parsers: `fast-csv` for CSV, `exceljs` streaming for XLSX
* Column auto-detection (header-based heuristics)
* Mapping UI: user maps detected columns → canonical fields, with preview
* Validation: type, range, referential integrity, uniqueness
* Partial import: valid rows imported, invalid rows held in `import_jobs.invalid_records`
* Re-import handling: same `external_id` → upsert, audit logged
* Five canonical dataset schemas (properties, tenants, leases, billing, payments)
* Data Sources page (Next.js): list of uploaded files with status
* Upload Data page (Next.js): file picker, format validation
* Data Mapping page (Next.js): column mapping UI
* Data Validation page (Next.js): validation report with per-row errors
* Background jobs: `parse-file`, `validate-rows`, `persist-import`
* Idempotency on import triggers
* File safety: size limit (50 MB), type validation, magic-byte check

**Acceptance criteria:**
* 100-row file with 5 invalid rows imports 95 successfully and reports the 5 with reasons
* 50,000-row CSV uploads without OOM
* Invalid format (e.g., PDF) rejected at upload with clear error
* Re-upload of same `external_id` updates existing row, audit logged
* Idempotency: replayed import request returns original result
* E2E: full upload → mapping → validation → import flow for all five datasets

**Brief phases covered:** Phase 4 (CSV/XLSX ingestion), Phase 5 (Data mapping + validation).

---

## 7. Slice 4 — Engine wired into API → Reconciliation Run → Dashboard + List + Detail

**Goal:** The engine is wired into the API. Reconciliation runs produce persisted exceptions. The dashboard shows real numbers. Users can drill into exceptions.

**Builds:**
* `reconciliation` module: orchestrates engine call + persistence transactionally
* `exception` module: exception CRUD, list with filters, detail with evidence
* Background job: `run-reconciliation` (BullMQ)
* Reconciliation run management: trigger, status, history, summary
* Advisory lock on `(organisation_id, scope_hash)` for concurrent run protection
* Idempotency on run triggers
* Dashboard page (Next.js): real numbers (total variance, exception counts by type/severity, top exceptions, "what requires attention")
* Reconciliation Processing page (Next.js): run status, history
* Exceptions list page (Next.js): filters (type, severity, status, tenant, property)
* Exception Detail page (Next.js): expected vs actual vs variance, deterministic explanation, source records, calculation breakdown, confidence, action controls, history
* Exception events: created, assigned, status_changed — all audited
* Materialised dashboard aggregates (if performance requires)

**Acceptance criteria:**
* Trigger run via API after import; see exceptions persisted with correct types, severities, variances, evidence
* Run summary correct (counts by type, total variance)
* Concurrent run on same scope is queued or rejected (not duplicated)
* Idempotent run trigger: replayed request returns original result
* Dashboard renders correctly with 0, 10, 1000, and 10000 exceptions
* Empty state shown when no data uploaded (no zero-value analytics)
* User can understand an exception fully without opening another spreadsheet
* E2E: import data → trigger run → see exceptions on dashboard → open one → understand it

**Brief phases covered:** Phase 7 (Exception generation), Phase 8 (Dashboard), Phase 9 (Exception detail + evidence).

---

## 8. Slice 5 — Resolution Workflow + Audit

**Goal:** The full Data → Truth → Exception → Evidence → Action → Resolution loop works. Every action is audited.

**Builds:**
* Exception status transitions: open → investigating → resolved/dismissed (with reason + notes)
* Forbidden transitions rejected (e.g., dismissed → resolved not allowed)
* Assignment: assign to user, unassign, reassign
* Comments: add comment to exception (audit logged)
* Bulk actions: select multiple exceptions, assign or dismiss with shared reason
* Reopen: dismissed/resolved can be reopened by an authorised user
* Audit log entries for every action with actor, action, entity, previous state, new state
* Audit log viewer (admin-only)
* Resolution page (Next.js): reason + notes form on resolve/dismiss
* History panel on Exception Detail page (chronological events)
* Settings page (Next.js): basic org settings, user management (owner-only)

**Acceptance criteria:**
* All status transitions audited with previous and new state
* Forbidden transitions rejected with clear error
* Bulk actions: 10 exceptions dismissed with shared reason → 10 audit log entries
* Reopen: dismissed exception can be reopened; reopen audit logged
* Audit log viewer: owner can see all entries; analyst cannot (403)
* E2E: open exception → assign → comment → investigate → resolve with reason → reopen → dismiss with reason → audit log shows full history

**Brief phases covered:** Phase 10 (Resolution workflow), Phase 11 (Audit logging — complete).

---

## 9. Slice 6 — AI Explanation Layer (lazy, optional)

**Goal:** An optional AI-generated plain-English explanation for each exception, behind an abstraction layer that can be disabled without affecting the product.

**Builds:**
* `ai` module: `LlmClient` interface
* `OpenAiLlmClient` (default — pending Q6)
* `AnthropicLlmClient` (alternative)
* `NoopLlmClient` (returns null; product works without AI)
* Lazy AI explanation on exception detail view (first view triggers generation, cached in `exceptions.ai_explanation`)
* Strict invariants enforced:
  * LLM input is only the exception's `source_records`
  * LLM output cannot introduce money values not in source
  * LLM output is clearly labelled "AI-generated summary — see evidence for source"
  * LLM output is never used to transition status or modify financial records
* Suggest payment allocation (Rule 4 assistance): LLM suggests most likely invoice; suggestion is never auto-applied
* AI feature flag (off by default in dev, on in staging/production if API key set)
* Graceful degradation: if AI is down, product works with deterministic explanations only

**Acceptance criteria:**
* With AI on: exception detail shows AI explanation alongside deterministic explanation
* With AI off: exception detail shows only deterministic explanation; no errors
* AI cannot modify any financial record (verified by test)
* AI output references source records (verified by spot check on 10 sample explanations)
* AI service down → product still works (verified by killing the AI provider in test)

**Brief phases covered:** Partial Phase 6 (AI assistance — only the parts the brief allows).

---

## 10. Slice 7 — Production Hardening + DoD Verification

**Goal:** The MVP meets the Definition of Done on a staging environment with realistic data.

**Builds:**
* Rate limiting on all endpoints (per-IP on auth, per-user on expensive endpoints)
* File size/type validation tightened
* RLS verification: automated test suite that attempts cross-org access via direct DB queries
* Error tracking (Sentry or equivalent)
* Structured logging with correlation IDs
* Health checks (DB, Redis, S3, queue)
* Backup/restore procedure documented and tested
* Staging deployment (target cloud — pending Q7)
* All 16 DoD E2E tests passing on staging
* All robustness tests passing
* All edge case tests passing
* Performance tests meeting targets
* Security tests passing
* Realistic test data loaded on staging; reconciliation run produces expected report
* Worklog updated with slice-by-slice build history

**Acceptance criteria:**
* App runs unattended on staging for 24 hours without errors
* Backup restore verified (restore to a fresh DB, app starts, data intact)
* All 16 DoD points verified on staging
* Worklog records completion

**Brief phases covered:** Phase 12 (Testing + edge cases), Phase 13 (Production hardening).

---

## 11. Slice Discipline

* One slice at a time. No slice starts until the previous slice is verified against its acceptance criteria.
* Slice acceptance criteria are not negotiable. "Mostly done" is not done.
* The worklog records slice completion before the next slice starts.
* If a slice reveals an architectural problem, we stop and fix the architecture before continuing.
* If a slice reveals a product ambiguity, we propose the resolution in the chat, not in code.
* Scope creep within a slice is forbidden. New feature ideas are noted in `docs/future-considerations.md` (created if needed) and not implemented.

---

## 12. Summary Table

| Slice | Brief phases covered | Critical deliverable |
|---|---|---|
| 0 | Phase 1 | Reproducible dev environment |
| 1 | Phase 2, partial 3, partial 11 | Multi-tenancy verified end-to-end |
| 2 | Phase 6 | Engine produces correct report on planted discrepancies |
| 3 | Phase 4, Phase 5 | Data ingestion handles bad data safely |
| 4 | Phase 7, 8, 9 | Reconciliation runs, dashboard, exception detail work end-to-end |
| 5 | Phase 10, 11 | Resolution loop + audit complete |
| 6 | (AI parts of Phase 6) | Optional AI layer, gracefully degradable |
| 7 | Phase 12, 13 | DoD met on staging |
