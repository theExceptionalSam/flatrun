# Revenue Control — Shared Worklog

> Append-only. Every agent (including the main agent) records work here before moving on. Read previous entries before starting work; append new entries after finishing.

---
Task ID: planning-1
Agent: main (Super Z)
Task: Technical planning pass for Revenue Control MVP. Reframe the build as vertical slices per the user's operating protocol. Create /docs as the source of truth.

Work Log:
- Read user's operating protocol instruction (hierarchy of authority, build loop, vertical slices, source of truth rule, "CSV in → report out" as the first real milestone).
- Created `/home/z/my-project/revenue-control/` project directory.
- Created `/home/z/my-project/revenue-control/docs/` source-of-truth folder.
- Wrote `docs/product-brief.md` — the verbatim master brief (Sections 1–29), as source of truth.
- Wrote `docs/architecture.md` — modular monolith, NestJS + Next.js + Postgres + Redis + S3; 10 modules; AI port pattern; RLS defence-in-depth; idempotency.
- Wrote `docs/database-schema.md` — full SQL schema for 12 tables: organisations, users, memberships, data_sources, import_jobs, properties, tenants, leases, invoices, payments, reconciliation_runs, exceptions, exception_events, audit_logs. Plus RLS sketch and indexing strategy.
- Wrote `docs/reconciliation-rules.md` — the 6 deterministic rules with precise trigger conditions, severity ladders, confidence values, evidence shapes, and engine orchestration order. Includes explicit "what AI does NOT touch" section.
- Wrote `docs/user-flows.md` — the primary end-to-end flow plus the five vertical slice flows plus secondary flows plus out-of-scope flows.
- Wrote `docs/security.md` — three-layer tenancy isolation, RBAC matrix, audit logging shape, file handling, input validation, rate limiting, secrets, encryption, idempotency.
- Wrote `docs/edge-cases.md` — the 13 brief-mandated edge cases plus 22 planning-identified edge cases plus engine-specific and security-specific edge cases. Each has treatment.
- Wrote `docs/definition-of-done.md` — the 16-point DoD mapped to specific E2E tests, plus robustness tests, edge case test matrix, performance and security test targets.
- Wrote `docs/build-slices.md` — the 7-slice vertical execution plan (Slice 0 Foundation → Slice 7 Hardening), with acceptance criteria per slice. Slice 2 (the engine + CLI) is explicitly the gate: no UI gets built until the engine produces the correct report on planted discrepancies.
- Wrote `docs/operating-protocol.md` — the hierarchy of authority, the build loop (PLAN → IMPLEMENT → TEST → INSPECT → FIX → DOCUMENT → COMMIT → NEXT), anti-patterns, worklog discipline, source-of-truth rule, the "first real milestone" principle, and the 8 open approval questions.
- Wrote `README.md` at project root — points to `docs/product-brief.md` as source of truth, lists the documentation index, summarises the slice plan and current status.

Stage Summary:
- Source-of-truth documentation set is committed under `/home/z/my-project/revenue-control/docs/`.
- The build has been reframed from 13 horizontal phases (brief Section 28) to 7 vertical slices that ship working software in increments while honouring the brief's phase order.
- Slice 2 (engine + CLI) is explicitly the first real milestone and the gate. No UI gets built until the engine produces a correct report on the planted-discrepancy fixtures.
- The hierarchy of authority (user instruction > product-brief.md > approved architecture > existing implementation > agent assumptions) is now encoded in two places: README.md and docs/operating-protocol.md.
- The build loop is encoded in docs/operating-protocol.md. Anti-patterns are listed explicitly.
- 8 approval questions remain open (recorded in docs/operating-protocol.md Section 10): tech stack confirmation, monorepo decision, auth provider, currency handling, conflicting-leases edge case, AI provider, deployment target, scope confirmation.
- No application code has been written. Slice 0 has not started. Awaiting user's answers to the 8 questions.

Decisions Requiring Approval:
1. Tech stack confirmation (NestJS + Next.js + Postgres + Redis + S3 + JWT auth provider).
2. Monorepo (pnpm workspace) vs separate repos.
3. Auth provider: build vs buy (recommended: Clerk or Auth0).
4. Currency handling for MVP: detect mismatch at validation, flag as invalid, defer cross-currency. Confirm?
5. Conflicting-leases edge case: (a) 7th exception type, (b) validation error blocking import, or (c) system warning. Proposed (c).
6. AI provider: OpenAI default with abstraction port. Confirm?
7. Deployment target: Render for MVP, AWS for production. Confirm?
8. Scope confirmation: nothing in the "Future Features — Do Not Build Now" list will be built. Confirm.

Next Action: Await user's answers to the 8 questions. On approval, start Slice 0 (Foundation).
