# Architecture

> **Status:** Approved plan. Implementation pending the 8 approval answers in the chat.
> **Source of truth:** `/docs/product-brief.md` Section 20 (Stack) and Section 21 (Architecture principle).

---

## 1. High-Level Shape

A **modular monolith** in NestJS, with a Next.js frontend, PostgreSQL, Redis (queue), and S3-compatible object storage. A separate `reconciliation-engine` package holds the pure domain logic with zero infrastructure dependencies.

```
                       ┌─────────────────────────────┐
                       │       Next.js Web App        │
                       │   (SSR pages + thin API      │
                       │    client; no business logic)│
                       └──────────────┬──────────────┘
                                      │ HTTPS (JWT)
                       ┌──────────────▼──────────────┐
                       │        NestJS API            │
                       │  (modular monolith)          │
                       │                              │
                       │  ┌────────────────────────┐  │
                       │  │  Auth Module            │  │
                       │  │  Organisation Module    │  │
                       │  │  DataSource Module     │  │
                       │  │  Import Module          │  │
                       │  │  Portfolio Module       │  │
                       │  │  Reconciliation Module   │  │
                       │  │  Exception Module       │  │
                       │  │  Audit Module           │  │
                       │  │  AI Module (abstraction)│  │
                       │  └────────────────────────┘  │
                       └──┬─────────┬──────────────┬──┘
                          │         │              │
                  ┌───────▼──┐  ┌────▼─────┐  ┌─────▼─────┐
                  │ Postgres │  │   S3     │  │  Queue    │
                  │  (RLS)   │  │ (files)  │  │ (BullMQ/  │
                  │          │  │          │  │  Redis)    │
                  └──────────┘  └──────────┘  └─────┬─────┘
                                                     │
                                              ┌──────▼──────┐
                                              │  Workers    │
                                              │  - import   │
                                              │  - reconcile│
                                              │  - ai tasks │
                                              └─────────────┘

         ┌────────────────────────────────────┐
         │  packages/reconciliation-engine     │
         │  (PURE — no DB, no NestJS, no I/O)  │
         │  Called by Reconciliation Module    │
         │  + Workers + CLI test harness       │
         └────────────────────────────────────┘
```

---

## 2. Why Modular Monolith (not microservices)

* The MVP has one bounded context: revenue reconciliation. There is no team or scale reason to distribute.
* Module boundaries in NestJS give us the same separation benefits.
* If we later extract the AI service or a heavy ingestion service, the module interfaces become the service contracts.

---

## 3. Module Responsibilities

| Module | Owns | Does NOT own |
|---|---|---|
| `auth` | signup, login, JWT, sessions, password reset | organisation data, roles |
| `organisation` | orgs, memberships, roles, invites | users (auth owns users) |
| `data-source` | file upload, S3 storage, parsing | validation rules, persistence to domain tables |
| `import` | column detection, mapping, validation, partial import | file storage (data-source owns that) |
| `portfolio` | properties, tenants, leases CRUD | reconciliation |
| `billing` | invoices, payments CRUD | reconciliation |
| `reconciliation` | orchestration: load → call engine → persist exceptions | the rules themselves (those live in the package) |
| `exception` | exception lifecycle, assignment, status transitions, comments | how exceptions are detected |
| `audit` | audit log writes + reads | nothing — passive module |
| `ai` | LLM client port + provider impls | business logic of any kind |

---

## 4. Architectural Rules

1. **No business logic in controllers.** Controllers translate HTTP ↔ service calls.
2. **Services own business logic; repositories own persistence.**
3. **The reconciliation engine is pure.** It takes normalised records in, returns exceptions out. No database calls, no NestJS, no I/O. Tested in isolation. Reusable from workers, CLI, or future services.
4. **Background jobs for anything slow.** Imports and reconciliation runs are queued, never synchronous on the request thread.
5. **AI is a port, not a provider.** A `LlmClient` interface with concrete provider implementations swappable behind config. No business code imports the LLM SDK directly.
6. **Idempotency keys** on every mutation that can be retried (import triggers, reconciliation runs, exception state transitions).
7. **Cross-module communication via service interfaces**, never via direct repository access to another module's tables.
8. **Money is never floating point.** Use `NUMERIC(18,2)` in Postgres; use a decimal library or integer kobo/cents in the engine.
9. **All timestamps UTC with timezone.**
10. **All primary keys are UUIDs.**

---

## 5. Request Flow

```
Browser
  → Next.js (SSR for shell, client-side data fetching for interactive screens)
  → NestJS controller (validates input via zod schema from packages/shared)
  → Service (orchestrates)
  → Repository (persists)
  → Postgres (RLS-enforced)
```

For long-running work:

```
Browser
  → NestJS controller
  → Service enqueues job (BullMQ)
  → Returns job_id immediately
  → Worker picks up job
  → Worker calls service methods
  → Service persists, emits events
  → Browser polls / subscriscribes for status
```

---

## 6. Background Jobs

| Queue | Job types | Concurrency |
|---|---|---|
| `import` | `parse-file`, `validate-rows`, `persist-import` | 5 per org |
| `reconciliation` | `run-reconciliation` | 1 per org (advisory lock on scope) |
| `ai` | `generate-exception-explanation`, `assist-record-match` | 10 (stateless) |

Every job is idempotent: a job with the same idempotency key returns the original result on retry, never creates duplicate state.

---

## 7. AI Integration

The `ai` module exposes:

```typescript
interface LlmClient {
  explainException(input: ExceptionEvidenceInput): Promise<ExplanationOutput>;
  suggestPaymentAllocation(input: UnallocatedPaymentInput): Promise<AllocationSuggestionOutput>;
  // Future: extractLeaseClause(input: PdfInput) ...
}
```

Concrete implementations:
* `OpenAiLlmClient` (default for MVP, pending approval Q6)
* `AnthropicLlmClient` (alternative, behind config flag)
* `NoopLlmClient` (returns null; used when AI is disabled or down — product still works)

**Strict invariants:**
* Every LLM output that contains a money value MUST cite the source record it came from. If it can't cite, it doesn't say it.
* LLM output is stored in `exceptions.ai_explanation` and clearly labelled as AI-generated. The deterministic `explanation` is always present and authoritative.
* LLM output is never used to modify `invoices`, `payments`, or `leases`.
* LLM output is never used to transition an exception's status.

---

## 8. Multi-Tenancy Enforcement

Three layers, defence-in-depth:

1. **Application layer.** Every query passes `organisation_id` extracted from the JWT. The `@OrgId()` decorator + `OrgMemberGuard` enforce this on every controller.
2. **Database layer (RLS).** Row-Level Security policies on every tenant-scoped table. Even if the application layer is bypassed, the database rejects cross-org queries.
3. **Audit layer.** Every query and mutation is logged with the actor's `organisation_id`. Periodic automated checks scan for any access pattern that doesn't match the actor's org.

---

## 9. Error Handling

* All errors follow a single shape: `{ code: string, message: string, details?: object }`.
* A global exception filter maps domain errors to HTTP status codes.
* No stack traces in production responses.
* All errors logged with structured logging (correlation ID, actor ID, org ID, request ID).

---

## 10. Observability

| Signal | Tool |
|---|---|
| Logs | Structured JSON to stdout, picked up by cloud logging |
| Metrics | Prometheus-compatible metrics endpoint |
| Traces | OpenTelemetry, exported to whichever trace backend the deployment target provides |
| Errors | Sentry or equivalent |
| Health | `/health` (liveness) + `/health/ready` (readiness — checks DB, Redis, S3, queue) |

---

## 11. Configuration

* All config via environment variables.
* Config validated on startup via a zod schema. Invalid config = process exits.
* No secrets in code or in the repo. `.env.example` documents the variables; `.env` is gitignored.
* Secrets in production via the cloud provider's secret manager.

---

## 12. Deployment

* Three environments: `dev` (local Docker), `staging` (cloud), `production` (cloud).
* Each environment has its own Postgres, Redis, S3 bucket, and AI provider config.
* Deployments are reproducible via Infrastructure-as-Code (Terraform or equivalent — pending Q7).
* Database migrations run as a separate step before the app starts, with a rollback plan.
