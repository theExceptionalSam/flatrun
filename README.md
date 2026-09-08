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

## 2. Repository Layout

```
flatrun/                              # this repo
├── docs/                            # source-of-truth documentation
│   ├── product-brief.md             # THE product specification
│   ├── architecture.md
│   ├── database-schema.md
│   ├── reconciliation-rules.md
│   ├── user-flows.md
│   ├── security.md
│   ├── edge-cases.md
│   ├── definition-of-done.md
│   ├── build-slices.md
│   └── operating-protocol.md
├── packages/
│   └── reconciliation-engine/       # PURE TypeScript, zero infra deps
│       ├── src/
│       │   ├── types.ts
│       │   ├── decimal.ts
│       │   ├── period.ts
│       │   ├── escalation.ts
│       │   ├── matching.ts
│       │   ├── templates.ts
│       │   ├── engine.ts
│       │   ├── index.ts
│       │   └── rules/
│       │       ├── underbilling.ts          (Rule 1)
│       │       ├── missing-billing.ts       (Rule 2)
│       │       ├── underpayment.ts          (Rule 3)
│       │       ├── unallocated-payment.ts   (Rule 4)
│       │       ├── missed-escalation.ts     (Rule 5)
│       │       └── duplicate-anomalous-billing.ts  (Rule 6)
│       ├── cli/
│       │   └── reconcile.ts          # CLI: 5 CSVs → reconciliation report
│       └── test/
│           └── fixtures/              # planted discrepancies (Tenant A-F)
├── prisma/                           # Prisma schema (Slice 1+)
├── src/                              # Next.js 16 app (Slice 1+)
│   └── app/
├── worklog.md                        # shared append-only worklog across slices
├── package.json
└── README.md                         # this file
```

---

## 3. Documentation Index

| Document | Purpose |
|---|---|
| [`docs/product-brief.md`](./docs/product-brief.md) | The source-of-truth product specification. Everything else defers to this. |
| [`docs/architecture.md`](./docs/architecture.md) | Modular monolith, module responsibilities, AI port. |
| [`docs/database-schema.md`](./docs/database-schema.md) | Full SQL schema, RLS policies, indexing strategy. |
| [`docs/reconciliation-rules.md`](./docs/reconciliation-rules.md) | The six deterministic exception rules, with trigger conditions, severity, confidence, and evidence. |
| [`docs/user-flows.md`](./docs/user-flows.md) | The five vertical slice flows and secondary user flows. |
| [`docs/security.md`](./docs/security.md) | Tenancy isolation, RBAC, audit, file handling, secrets, idempotency. |
| [`docs/edge-cases.md`](./docs/edge-cases.md) | All edge cases identified, with treatment. |
| [`docs/definition-of-done.md`](./docs/definition-of-done.md) | The 16-point DoD, mapped to E2E tests. |
| [`docs/build-slices.md`](./docs/build-slices.md) | The vertical-slice execution plan (the actual shipping order). |
| [`docs/operating-protocol.md`](./docs/operating-protocol.md) | The build loop, hierarchy of authority, worklog discipline, anti-patterns. |

---

## 4. Operating Protocol (read this before building anything)

* **Build in vertical slices**, not horizontal phases. See [`docs/build-slices.md`](./docs/build-slices.md).
* **Follow the build loop:** PLAN → IMPLEMENT → TEST → INSPECT → FIX → DOCUMENT → COMMIT → NEXT. See [`docs/operating-protocol.md`](./docs/operating-protocol.md).
* **The first real milestone is:** five CSVs in → reconciliation report out. If that doesn't work, no UI gets built.
* **Never replace deterministic financial logic with AI.** AI interprets ambiguity only. See [`docs/reconciliation-rules.md`](./docs/reconciliation-rules.md) Section 5.
* **Never silently change scope.** Propose the change first, get approval, then implement.
* **Log every unit of work** in [`worklog.md`](./worklog.md) (shared across all agents and slices).

---

## 5. The Slice Plan (summary)

| Slice | What it ships | Brief phases | Status |
|---|---|---|---|
| 0 | Reproducible dev environment | Phase 1 | Pending |
| 1 | Signup → Organisation → Empty Dashboard (multi-tenancy verified) | Phase 2, partial 3, 11 | Pending |
| 2 | **5 CSVs → Reconciliation report (CLI)** — the first real milestone | Phase 6 | **DONE** |
| 3 | Upload CSV → Map → Validate → Import | Phases 4, 5 | Pending |
| 4 | Engine wired into API → Reconciliation Run → Dashboard + List + Detail | Phases 7, 8, 9 | Pending |
| 5 | Resolution Workflow + Audit | Phases 10, 11 | Pending |
| 6 | AI Explanation Layer (lazy, optional, gracefully degradable) | (AI parts of Phase 6) | Pending |
| 7 | Production Hardening + DoD verification | Phases 12, 13 | Pending |

See [`docs/build-slices.md`](./docs/build-slices.md) for full acceptance criteria per slice.

---

## 6. Current Status

* **Slice 2 (engine) — COMPLETE.** The reconciliation engine is a pure TypeScript package that produces a correct report on the planted-discrepancy fixtures. See `worklog.md` Task ID `slice-2` for the build report.
* **Sandbox stack note:** For the MVP, the web app uses the sandbox-provided Next.js 16 + Prisma (SQLite) + NextAuth stack (decision: Path A, 2026-09-09). The approved production stack (NestJS + Postgres + Redis + S3 + Clerk) is documented in `docs/architecture.md` and is the migration target post-MVP. The engine — pure TypeScript — works unchanged in either stack.
* **Source-of-truth docs:** committed under `/docs/`.

---

## 7. Quick Start

### Run the reconciliation engine (no infrastructure needed)

```bash
cd packages/reconciliation-engine
bun run cli/reconcile.ts test/fixtures
```

Expected output: `5 exceptions, ₦1,125,000.00 variance` — matching the planted discrepancies (Tenant A clean; B underbilling; C missed escalation; D underpayment; E unallocated payment; F duplicate invoice).

### Run the Next.js web app (Slice 1+)

```bash
bun install
bun run db:push     # initialize SQLite via Prisma
bun run dev          # Next.js dev server on port 3000
```

(The web app is built in Slices 1, 3, 4, 5. As of Slice 2 it is still the sandbox skeleton.)
