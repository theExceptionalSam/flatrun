# Security

> **Status:** Approved plan.
> **Source of truth:** `/docs/product-brief.md` Section 18 (Security) and Section 19 (Audit logging).

---

## 1. Tenancy Isolation (defence-in-depth, three layers)

### Layer 1 — Application
* Every controller uses `@OrgId()` decorator to extract `organisation_id` from the JWT.
* `OrgMemberGuard` verifies the user is an active member of that org.
* Every repository query accepts `organisation_id` and filters on it. There is no "global" query path.
* Cross-org access attempts are rejected with 403 and logged to the audit log.

### Layer 2 — Database (Row-Level Security)
* RLS policies on every tenant-scoped table.
* The application connects with a role that has `current_setting('app.organisation_id')` set per request.
* RLS policies filter on that setting: `organisation_id = current_setting('app.organisation_id')::uuid`.
* Even if the application layer is bypassed (e.g., a bug in a query), the database rejects cross-org reads and writes.

### Layer 3 — Audit
* Every query and mutation is logged with the actor's `organisation_id`.
* Automated checks scan for any access pattern where the actor's org does not match the accessed resource's org. Alerts on mismatch.

---

## 2. Authentication

* **External provider** for the MVP (Clerk or Auth0 — pending approval Q3).
* Passwords (if any) are bcrypt-hashed with a work factor of 12+.
* JWT access tokens (short TTL, 15 minutes) + refresh tokens (longer TTL, rotated on use).
* All auth tokens stored httpOnly, secure, sameSite=strict cookies.
* No tokens in localStorage.
* Future SSO/MFA supported by the chosen provider — not built in MVP, but the provider must support it.

---

## 3. Role-Based Access Control

Four roles:

| Role | Permissions |
|---|---|
| `owner` | All actions, including org settings, user management, audit log access |
| `finance_manager` | All data actions (upload, reconcile, exception management), no org settings |
| `analyst` | Exception investigation, assignment, resolution; no upload; no org settings |
| `viewer` | Read-only access to dashboard and exceptions; no actions |

Every controller method is annotated with `@Roles(...)` and guarded by `RolesGuard`.

---

## 4. Audit Logging

Every mutation writes to `audit_logs`:

| Field | Value |
|---|---|
| `actor_id` | The user, or NULL for system-generated |
| `action` | e.g., `exception.status_changed`, `import.completed`, `reconciliation.run_started` |
| `entity_type` | e.g., `exception`, `import_job`, `reconciliation_run` |
| `entity_id` | UUID |
| `previous_state` | JSONB snapshot before the mutation |
| `new_state` | JSONB snapshot after the mutation |
| `ip_address` | From request |
| `user_agent` | From request |
| `created_at` | UTC timestamp |

Audit logs are **append-only**. No updates, no deletes (except by a documented retention policy applied months later, never ad-hoc).

The audit log viewer is admin-only (`owner` role).

---

## 5. File Handling

* Upload size limit: 50 MB per file (configurable).
* Allowed file types: `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX). Anything else rejected at upload.
* Files are scanned for malicious content (basic magic-byte verification, not full AV).
* Files stored in S3-compatible object storage, in a bucket with strict access policies.
* File URLs returned to the client are short-lived signed URLs (5 minutes), never public.
* Files are never executed on the server. Parsing libraries are read-only consumers.

---

## 6. Input Validation

* Every API request validated against a zod schema in `packages/shared`.
* Unknown fields in request bodies are rejected (not silently dropped).
* String inputs are length-bounded.
* Numeric inputs are range-bounded.
* Date inputs are ISO 8601, parsed strictly.
* IDs are UUIDs, validated.
* No SQL string concatenation anywhere — always parameterised queries via the query builder or ORM.

---

## 7. Rate Limiting

* Per-IP rate limit on auth endpoints (login, signup, password reset) to prevent brute force.
* Per-user rate limit on expensive endpoints (file upload, reconciliation trigger).
* Rate limit responses use 429 with `Retry-After` header.
* Rate limits are configurable via environment variables.

---

## 8. Secrets Management

* No secrets in code or in the repo.
* `.env.example` documents the variables; `.env` is gitignored.
* Local dev uses `.env` (developer's responsibility).
* Staging and production use the cloud provider's secret manager (AWS Secrets Manager, GCP Secret Manager, or equivalent — pending approval Q7).
* Secrets are rotated on a schedule; the app reloads secrets without restart where supported.
* The DB connection string, JWT signing key, S3 credentials, AI provider API key are all secrets — never logged, never returned in API responses, never included in error messages.

---

## 9. Encryption

* TLS 1.2+ for all connections (browser ↔ app, app ↔ DB, app ↔ S3, app ↔ AI provider).
* At rest: Postgres uses the cloud provider's encryption (RDS encryption at rest, or equivalent). S3 uses server-side encryption with KMS.
* Application secrets encrypted at rest via the secret manager.
* No application-level encryption of business data in the MVP — the cloud provider's at-rest encryption is sufficient.

---

## 10. Idempotency

Every mutating endpoint that can be retried accepts an `Idempotency-Key` header.

* The key is stored alongside the response.
* A second request with the same key returns the original response, without re-executing the mutation.
* Keys are scoped to the user, so two users can use the same key without collision.
* Applies to: `POST /imports`, `POST /reconciliation-runs`, `POST /exceptions/:id/transition`.

This prevents duplicate imports and duplicate reconciliation runs when clients retry after network errors.

---

## 11. Audit Trail for the Audit Trail

The audit log itself is append-only and protected. Modifications to the audit log (which should never happen) would themselves be logged to a separate, tamper-evident store. In the MVP, this is a strong policy + database constraint, not a blockchain-style solution.

---

## 12. Security Checklist Before Each Slice Ships

* [ ] No new endpoint lacks an `@OrgId()` guard
* [ ] No new repository method lacks an `organisation_id` filter
* [ ] No new mutation lacks an audit log entry
* [ ] No new file handling bypasses size/type validation
* [ ] No new request body lacks zod validation
* [ ] No new secret is hardcoded
* [ ] Cross-org access test passes for any new entity

---

## 13. What We Are NOT Doing in the MVP

* Custom SSO integration (the provider handles this when needed).
* Field-level encryption (not required for the data classes we hold in MVP).
* Customer-managed encryption keys (enterprise feature for a later phase).
* Penetration testing (deferred to a later phase, but the architecture supports it).
* SOC 2 / ISO 27001 formal certification (enterprise sales enabler for later).
* Data residency / multi-region replication (deferred; single-region for MVP).
