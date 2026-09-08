# Revenue Control

> **Source of truth:** [`/docs/product-brief.md`](./docs/product-brief.md)
>
> Revenue Control is the first product in a larger Real Estate Execution OS. It solves one specific problem: **automated reconciliation and exception detection between lease obligations, billing records, and payment records.**

---

## 1. Hierarchy of Authority

When making any decision, defer to the highest authority on this list:

1. Explicit user instruction
2. [`/docs/product-brief.md`](./docs/product-brief.md) — the product specification
3. Approved architecture decisions in `/docs/`
4. Existing implementation (where it doesn't conflict with the above)
5. Agent assumptions (lowest authority)

**Never silently change product scope.** If an implementation conflicts with the brief, stop, identify the conflict, and resolve it before continuing.

---

## 2. Documentation Index

| Document | Purpose |
|---|---|
| [`docs/product-brief.md`](./docs/product-brief.md) | The source-of-truth product specification. Everything else defers to this. |
| [`docs/architecture.md`](./docs/architecture.md) | Modular monolith, NestJS + Next.js + Postgres + Redis + S3, module responsibilities, AI port. |
| [`docs/database-schema.md`](./docs/database-schema.md) | Full SQL schema, RLS policies, indexing strategy. |
| [`docs/reconciliation-rules.md`](./docs/reconciliation-rules.md) | The six deterministic exception rules, with trigger conditions, severity, confidence, and evidence. |
| [`docs/user-flows.md`](./docs/user-flows.md) | The five vertical slice flows and secondary user flows. |
| [`docs/security.md`](./docs/security.md) | Tenancy isolation, RBAC, audit, file handling, secrets, idempotency. |
| [`docs/edge-cases.md`](./docs/edge-cases.md) | All edge cases identified, with treatment. |
| [`docs/definition-of-done.md`](./docs/definition-of-done.md) | The 16-point DoD, mapped to E2E tests. |
| [`docs/build-slices.md`](./docs/build-slices.md) | The vertical-slice execution plan (the actual shipping order). |
| [`docs/operating-protocol.md`](./docs/operating-protocol.md) | The build loop, hierarchy of authority, worklog discipline, anti-patterns. |

---

## 3. Operating Protocol (read this before building anything)

* **Build in vertical slices**, not horizontal phases. See [`docs/build-slices.md`](./docs/build-slices.md).
* **Follow the build loop:** PLAN → IMPLEMENT → TEST → INSPECT → FIX → DOCUMENT → COMMIT → NEXT. See [`docs/operating-protocol.md`](./docs/operating-protocol.md).
* **The first real milestone is:** five CSVs in → reconciliation report out. If that doesn't work, no UI gets built.
* **Never replace deterministic financial logic with AI.** AI interprets ambiguity only. See [`docs/reconciliation-rules.md`](./docs/reconciliation-rules.md) Section 5.
* **Never silently change scope.** Propose the change first, get approval, then implement.
* **Log every unit of work** in `/home/z/my-project/worklog.md` (shared across all agents and slices).

---

## 4. The Slice Plan (summary)

| Slice | What it ships | Brief phases |
|---|---|---|
| 0 | Reproducible dev environment | Phase 1 |
| 1 | Signup → Organisation → Empty Dashboard (multi-tenancy verified) | Phase 2, partial 3, 11 |
| 2 | **5 CSVs → Reconciliation report (CLI)** — the first real milestone | Phase 6 |
| 3 | Upload CSV → Map → Validate → Import | Phases 4, 5 |
| 4 | Engine wired into API → Reconciliation Run → Dashboard + List + Detail | Phases 7, 8, 9 |
| 5 | Resolution Workflow + Audit | Phases 10, 11 |
| 6 | AI Explanation Layer (lazy, optional, gracefully degradable) | (AI parts of Phase 6) |
| 7 | Production Hardening + DoD verification | Phases 12, 13 |

See [`docs/build-slices.md`](./docs/build-slices.md) for full acceptance criteria per slice.

---

## 5. Current Status

* **Phase:** Planning complete. Awaiting approval of 8 outstanding questions before Slice 0 begins.
* **Source-of-truth docs:** committed.
* **Open questions:** See [`docs/operating-protocol.md`](./docs/operating-protocol.md) Section 10.

---

## 6. Quick Start (after approval)

```bash
# Clone
git clone <repo> revenue-control
cd revenue-control

# Install
pnpm install

# Bring up infra (Postgres, Redis, MinIO)
docker compose up -d

# Run migrations
pnpm db:migrate

# Start dev
pnpm dev
# → web at http://localhost:3000
# → api at http://localhost:3001
```

(The above is the target state once Slice 0 is complete.)
