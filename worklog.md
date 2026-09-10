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

---
Task ID: slice-2
Agent: main (Super Z)
Task: Slice 2 — Build the reconciliation engine as a pure package and prove it works against planted test fixtures. This is the "first real milestone" gate from /docs/build-slices.md: if the engine doesn't work, no UI gets built.

Work Log:
- Read prior worklog entries (planning-1) to understand context.
- Acknowledged user's approval of 8 questions; recorded decisions in /docs/operating-protocol.md decision log (Clerk chosen over Auth0; OpenAI default for AI; Render for MVP, AWS for production; currency mismatch flagged at validation; conflicting leases = system warning; scope confirmed).
- Invoked fullstack-dev skill per system instruction. The sandbox initializes a Next.js 16 + Prisma (SQLite) + NextAuth project, which conflicts with the approved architecture (NestJS + Postgres + Redis + S3 + Clerk). Surfaced this conflict to user and chose a pragmatic path: build the engine first (no infrastructure needed) and resolve the rest of the stack question after the engine is proven.
- Created /home/z/my-project/revenue-control/packages/reconciliation-engine/ as a pure TypeScript package with zero infrastructure dependencies.
- Wrote src/types.ts — all normalised record types, exception draft shape, matching context types.
- Wrote src/decimal.ts — integer-kobo money helpers, tolerance function, formatNaira for display.
- Wrote src/period.ts — billing period math, date parsing, isLeaseActiveForPeriod.
- Wrote src/escalation.ts — escalation math. Initial implementation had a bug: escalation didn't apply from escalation_start_date onwards (only on anniversaries). Fixed by switching to calendar-month-based step counting.
- Wrote src/matching.ts — deterministic payment-to-invoice matching (Rules 1, 2, 3 from spec), FIFO allocation, unallocated classification with reasons.
- Wrote src/templates.ts — deterministic explanation templates for all 6 exception types.
- Wrote src/rules/underbilling.ts (Rule 1) with suppression support for periods where Rule 5 fired.
- Wrote src/rules/missing-billing.ts (Rule 2) with grace window.
- Wrote src/rules/underpayment.ts (Rule 3) using MatchingContext.
- Wrote src/rules/unallocated-payment.ts (Rule 4) using MatchingContext with reason classification.
- Wrote src/rules/missed-escalation.ts (Rule 5) returning fired periods for Rule 1 suppression.
- Wrote src/rules/duplicate-anomalous-billing.ts (Rule 6) with three sub-detections: exact duplicate, near-duplicate, anomalous amount.
- Wrote src/engine.ts — orchestrator that builds MatchingContext once and runs the 6 rules in the spec order (6 → 2 → 5 → 1 → 3 → 4).
- Wrote src/index.ts — public API exports.
- Created test fixtures in test/fixtures/: properties.csv (6), tenants.csv (6), leases.csv (6), billing.csv (37 invoices), payments.csv (38 payments). Planted discrepancies: Tenant A clean; Tenant B underbilling (March ₦50k); Tenant C missed escalation (June ₦25k, 5% annual escalation starting 2025-06-01); Tenant D underpayment (March ₦50k); Tenant E unallocated payment (₦500k, no open invoices); Tenant F duplicate invoice (March, ₦500k).
- Wrote cli/reconcile.ts — CLI runner that loads CSVs, normalises records, runs the engine, and prints a reconciliation report.
- First run: 88 exceptions (84 missing billing + 4 correct). Two bugs identified:
  (a) Missing billing rule fired for every month from lease start (2024-01-01) to asOf (2025-09-30) because leases were open-ended and we only had Jan-Jun 2025 invoices. Fixed by setting lease end_date to 2025-06-30 in fixtures (test data is now self-consistent).
  (b) Missed escalation rule did not fire because escalation logic was based on years elapsed (0 years = 0 steps). Fixed by switching to calendar-month-based step counting where the first escalation applies on the escalation_start_date itself.
- Second run: 5 exceptions, ₦1,125,000 total variance. Matches planted discrepancies exactly:
    Underbilling: 1 (Tenant B, March, ₦50k, confidence 0.85)
    Missed escalation: 1 (Tenant C, June, ₦25k, confidence 1.00)
    Underpayment: 1 (Tenant D, March, ₦50k, confidence 1.00)
    Unallocated payment: 1 (Tenant E, ₦500k, reason: no_open_invoices, confidence 0.95)
    Duplicate/anomalous billing: 1 (Tenant F, March, ₦500k, sub-type: duplicate, confidence 0.95)
- Rule 1 (underbilling) correctly suppressed for Tenant C's June period (where Rule 5 fired).

Stage Summary:
- The reconciliation engine — the crown jewel — is complete and proven.
- Pure TypeScript, zero infrastructure dependencies, runs in any environment (bun, node, browser, edge).
- The "first real milestone" gate from Slice 2 has passed: 5 CSVs in → reconciliation report out, matching planted discrepancies.
- Source-of-truth principle respected: deterministic software establishes financial truth. No AI was used for any financial calculation. AI's role (deferred to Slice 6) is purely to write supplementary explanations.
- Engine code is at /home/z/my-project/revenue-control/packages/reconciliation-engine/.
- Test fixtures are at /home/z/my-project/revenue-control/packages/reconciliation-engine/test/fixtures/.
- The CLI is runnable: `cd /home/z/my-project/revenue-control/packages/reconciliation-engine && bun run cli/reconcile.ts test/fixtures`.

What Was Built:
- packages/reconciliation-engine/src/types.ts
- packages/reconciliation-engine/src/decimal.ts
- packages/reconciliation-engine/src/period.ts
- packages/reconciliation-engine/src/escalation.ts
- packages/reconciliation-engine/src/matching.ts
- packages/reconciliation-engine/src/templates.ts
- packages/reconciliation-engine/src/rules/underbilling.ts
- packages/reconciliation-engine/src/rules/missing-billing.ts
- packages/reconciliation-engine/src/rules/underpayment.ts
- packages/reconciliation-engine/src/rules/unallocated-payment.ts
- packages/reconciliation-engine/src/rules/missed-escalation.ts
- packages/reconciliation-engine/src/rules/duplicate-anomalous-billing.ts
- packages/reconciliation-engine/src/engine.ts
- packages/reconciliation-engine/src/index.ts
- packages/reconciliation-engine/cli/reconcile.ts
- packages/reconciliation-engine/test/fixtures/properties.csv
- packages/reconciliation-engine/test/fixtures/tenants.csv
- packages/reconciliation-engine/test/fixtures/leases.csv
- packages/reconciliation-engine/test/fixtures/billing.csv
- packages/reconciliation-engine/test/fixtures/payments.csv

What Was Tested:
- Manual end-to-end test: ran the CLI against the planted fixtures and verified the report matches the expected discrepancies.
- Two bugs were found and fixed during testing: (a) escalation logic (b) test fixture self-consistency.

What Passed:
- Engine produces 5 exceptions matching the 5 planted discrepancies.
- Each exception has correct type, severity, variance, currency, confidence, and deterministic explanation.
- Rule 1 (underbilling) is correctly suppressed for periods where Rule 5 (missed escalation) fires.
- Payment matching is deterministic and uses the three specified rules (exact link, reference match, amount+date proximity).
- All money is integer kobo (no floating-point errors).
- Engine has zero infrastructure dependencies.

What Failed:
- (Already fixed) Initial escalation logic did not apply escalation from escalation_start_date.
- (Already fixed) Initial test fixtures had open-ended leases which triggered 84 spurious missing-billing exceptions.

What Remains:
- Slice 0 (Foundation): monorepo structure, NestJS API skeleton, Docker Compose for Postgres/Redis/MinIO. Currently blocked by sandbox constraint (see below).
- Slice 1 (Auth + Organisation): Clerk integration, multi-tenancy, RBAC. Currently blocked by sandbox constraint.
- Slice 3 (CSV Upload → Map → Validate → Import): needs NestJS API, Postgres, S3.
- Slice 4 (Engine wired into API → Dashboard + List + Detail): needs Slice 3 + UI work.
- Slice 5 (Resolution Workflow + Audit): needs Slice 4.
- Slice 6 (AI Explanation Layer): optional, behind abstraction port.
- Slice 7 (Production Hardening): needs full stack.

Decisions Requiring User Approval:
- Sandbox stack conflict: The fullstack-dev sandbox initializes Next.js 16 + Prisma (SQLite only) + NextAuth. The approved architecture specifies NestJS + Next.js + Postgres + Redis + S3 + Clerk. Three paths forward:
  (A) Build the rest of the MVP using the sandbox's stack (Next.js API routes instead of NestJS, Prisma + SQLite instead of Postgres + Redis, NextAuth instead of Clerk, local file storage instead of S3). Document this as a sandbox demo; production would use the approved stack. Fastest path to a working demo, but deviates from the brief.
  (B) Build the rest of the MVP using Docker Compose to run Postgres, Redis, MinIO locally, with NestJS as a separate process and Clerk via their hosted API. Faithful to the brief but may have friction in the sandbox.
  (C) Continue building pure-package components (e.g., expand the engine's test coverage, build the validation/import logic as a pure package) and defer the web app to a non-sandbox environment.
- Recommend path (A) for the MVP, with a clear documented plan to migrate to (B) for production. Path (A) ships fastest and the engine — the core IP — is already pure TypeScript that works in either environment.

Next Action: Await user's choice on path (A), (B), or (C). On selection, proceed with Slice 0/1 (or skip to Slice 3 if path A is chosen and we use the sandbox's existing Next.js + Prisma setup).

---
Task ID: repo-setup-1
Agent: main (Super Z)
Task: Push the project to GitHub at theExceptionalSam/flatrun per user's instruction. User chose path A (build the rest using the sandbox stack: Next.js 16 + Prisma SQLite + NextAuth; engine — already pure TypeScript — drops in unchanged).

Work Log:
- User provided GitHub repo URL (https://github.com/theExceptionalSam/flatrun) and a Personal Access Token (PAT) for authentication. WARNED user that the PAT is now in chat history and must be rotated at https://github.com/settings/tokens after the push completes.
- Restructured repo layout: moved /home/z/my-project/revenue-control/{docs,packages,README.md} to /home/z/my-project/{docs,packages,README.md}. This puts the source-of-truth docs at the repo root, the engine at /packages/reconciliation-engine/, and the Next.js app at the repo root (alongside package.json, prisma/, src/, etc.). Removed the now-empty /home/z/my-project/revenue-control/ directory.
- Verified engine still produces the correct 5-exception report from the new location (cd /home/z/my-project/packages/reconciliation-engine && bun run cli/reconcile.ts test/fixtures).
- Updated .gitignore: changed overly-broad 'test' pattern (which was excluding /packages/reconciliation-engine/test/) to '/test/' (root-only). Added /upload/, /download/, /skills/, /examples/, /mini-services/, /db/ as sandbox artifacts to ignore. Added standard env file exclusions.
- Updated README.md: documented the new repo layout, the slice plan with current status (Slice 2 = DONE), the sandbox stack note (path A), and quick-start commands for both the engine CLI and the Next.js web app.
- Untracked .env (was committed by sandbox init; only contained a local SQLite path, not a secret, but should not be tracked).
- Committed with descriptive message: "Restructure: flatten repo layout + commit Slice 2 (reconciliation engine)".
- Added remote: https://flatrun-bot:<PAT>@github.com/theExceptionalSam/flatrun.git (PAT in URL temporarily).
- Pushed to GitHub: `main` branch, commit ae0d46d. Push succeeded — new branch 'main' created at origin.
- Stripped PAT from local remote URL: `git remote set-url origin https://github.com/theExceptionalSam/flatrun.git`. PAT is no longer stored on disk in remote config.
- Verified: `git ls-remote origin` shows commit ae0d46d at HEAD and refs/heads/main.

Stage Summary:
- Repo is live at https://github.com/theExceptionalSam/flatrun with the full Slice 2 deliverable (engine + CLI + docs).
- Local remote URL no longer contains the PAT (security hygiene).
- Repo structure is clean: docs/, packages/reconciliation-engine/, src/ (Next.js), prisma/, README.md, package.json at the root.
- Path A confirmed: web app uses sandbox stack (Next.js 16 + Prisma SQLite + NextAuth). The approved production stack (NestJS + Postgres + Redis + S3 + Clerk) remains documented in /docs/architecture.md as the migration target.

Decisions Requiring User Approval:
- None for this task. User explicitly approved path A and the GitHub push.

Next Actions (to be communicated to user):
1. ROTATE the GitHub PAT immediately (it's in chat history).
2. Set up external accounts: Clerk, OpenAI, Sentry, Render, custom domain.
3. Create production env file template (.env.example with real keys).
4. Connect Render to the GitHub repo and trigger first deploy of the Next.js app (Slice 0/1 in the new sandbox stack).
5. Begin Slice 1 (auth + organisation) using NextAuth + Prisma + SQLite in the sandbox, with the engine ready to be wired in for Slice 3+.

---
Task ID: repo-polish-1
Agent: main (Super Z)
Task: Execute steps 1.2-1.6 from the next-steps guide (LICENSE, .env.example, CI, PR template, CONTRIBUTORS/SECURITY). User requested these before moving to step 2 (external accounts).

Work Log:
- 1.2 LICENSE: Created a proprietary "all rights reserved" LICENSE file. Note: User had already added a LICENSE via GitHub web UI (commit a7d929d "Add LICENSE file with copyright information") with a shorter version of the same proprietary clause. During rebase, resolved the conflict by keeping the user's version (their decision, simpler and equally valid).
- 1.3 .env.example + .env: Created .env.example (tracked, documents all env vars: app, database, auth, AI, error tracking, file storage, Clerk-future) and a local .env (gitignored, with a real NEXTAUTH_SECRET generated via openssl rand -base64 32). Fixed .gitignore: the existing .env* pattern was excluding .env.example from being tracked. Added !.env.example negation pattern. Verified .env is ignored and .env.example is untracked (will be added).
- 1.4 GitHub Actions CI: Created .github/workflows/ci.yml with two jobs:
   (a) Lint job: runs 'bun run lint' on the Next.js app.
   (b) Engine job: runs the reconciliation engine on test fixtures and verifies the output matches the planted discrepancies exactly:
       - Total: 5 exceptions (Tenant A clean; B/C/D/E/F each have 1)
       - Total variance: ₦1,125,000.00
       - Each type count correct (Underbilling 1, Missing billing 0, Underpayment 1, Unallocated payments 1, Missed escalations 1, Duplicate/anomalous billing 1)
   The engine report is uploaded as a CI artifact (7-day retention) for debugging.
   Set LANG=en_US.UTF-8 to ensure the ₦ character is handled correctly on Ubuntu runners.
   Validated all grep patterns against the actual engine output locally before committing — all 8 patterns matched.
- 1.5 PR template: Created .github/PULL_REQUEST_TEMPLATE.md with: summary, slice field (per docs/build-slices.md), acceptance criteria checklist, scope-change disclosure, worklog entry link, and a checklist before requesting review. Includes reviewer note about operating protocol checks (no scope creep, no AI for financial logic).
- 1.6 CONTRIBUTORS.md + SECURITY.md:
   - CONTRIBUTORS.md: Lists theExceptionalSam as founder/maintainer. Documents that Flatrun is proprietary and not currently accepting external contributions. Includes format for adding future maintainers.
   - SECURITY.md: vulnerability reporting process (security@flatrun.io, 48h acknowledgement, 7-day triage), in-scope and out-of-scope items, supported versions table (main only), security architecture summary linking to docs/security.md, and disclosure policy (30-90 day coordinated disclosure).

Cleanup:
- Untracked db/custom.db (local SQLite file should never be tracked).
- Untracked .zscripts/, examples/, mini-services/ (sandbox build artifacts).
- Set git config core.fileMode=false to ignore spurious mode changes from sandbox file operations.
- Committed as "Repo polish: LICENSE, .env.example, CI, PR template, SECURITY/CONTRIBUTORS" (commit a39e4c0 after rebase and LICENSE conflict resolution).

Stage Summary:
- All 5 polish tasks (1.2-1.6) complete and pushed to GitHub.
- Repo is now in a clean state: LICENSE, .env.example (with template), CI workflow (with engine verification gate), PR template, CONTRIBUTORS, SECURITY all in place.
- CI will trigger on the next push to main and on every PR. The engine job is the gate: if the engine produces anything other than the expected 5 exceptions / ₦1,125,000 variance, CI fails.
- User's existing LICENSE (added via GitHub web UI) preserved during rebase.

What Was Built:
- LICENSE (kept user's version after rebase conflict)
- .env.example (tracked template)
- .env (gitignored, with real local NEXTAUTH_SECRET)
- .github/workflows/ci.yml (two-job CI: lint + engine verification)
- .github/PULL_REQUEST_TEMPLATE.md
- CONTRIBUTORS.md
- SECURITY.md
- .gitignore updates (negation pattern for .env.example, sandbox artifact exclusions)

What Was Tested:
- Validated all CI grep patterns against actual engine output (8 patterns, all PASS).
- Verified .env is gitignored and .env.example is NOT ignored.
- Verified rebase preserved user's LICENSE commit (a7d929d) and my commit (a39e4c0) is on top.
- Verified push succeeded (a7d929d..a39e4c0 main -> main).

What Passed:
- Push to GitHub succeeded.
- Engine still produces correct 5-exception report (CI will verify this on every push).
- All polish files are in place on GitHub.

What Failed:
- Initial CI grep patterns did not match actual engine output format. Fixed patterns to match "  Total: 5" (with whitespace) and "Total variance: ₦1,125,000.00" exactly.
- Initial push was rejected because user had added a LICENSE via GitHub web UI in parallel. Resolved by rebasing onto FETCH_HEAD, resolving the LICENSE add/add conflict (kept user's version), and pushing again.

What Remains:
- Verify CI runs green on GitHub (user can check https://github.com/theExceptionalSam/flatrun/actions after GitHub processes the workflow).
- Step 0.1: User MUST rotate the GitHub PAT (still in chat history from previous turn).
- Step 0.2: User should configure git credential storage locally so future pushes don't need inline PAT.
- Step 0.3: User should add branch protection on main (after first green CI run, so the rule has a status check to require).
- Step 2: External accounts (Clerk, OpenAI, Sentry, Render) — user said do this after step 1.

Decisions Requiring User Approval:
- None. All work was within the explicitly approved step 1.2-1.6 scope.

Next Action: User verifies CI is green on GitHub Actions, then we proceed to Step 2 (external accounts) when they're ready.

---
Task ID: preview-1
Agent: main (Super Z)
Task: User asked "let me see what it looks like before deploying". Built a static preview dashboard at / that runs the actual reconciliation engine on the test fixtures and renders the result visually.

Work Log:
- Built src/lib/preview-data.ts: server-side helper that loads the 5 fixture CSVs, normalises them, runs the reconciliation engine, and returns the result + fixture counts.
- Built src/app/page.tsx: full dashboard UI using shadcn/ui components:
  - Header with Flatrun logo, "Reconciled as of" date, "Preview · Fixtures" badge.
  - Hero summary: total variance in large type, exception counts and data volume.
  - 4 stat cards: Expected revenue (monthly), Billed, Collected, Total variance (red).
  - 4 severity cards: Critical, High, Medium, Low counts.
  - Tabs component with two views: "All exceptions" (sorted table) and "By type" (cards per exception type).
  - Per-exception cards with deterministic explanation, severity badge, tenant/lease, variance, confidence, and evidence source-record references.
  - Amber callout at the bottom explicitly noting this is a static preview using planted fixtures, with a forward-reference to which slice replaces each part.
- Updated src/app/layout.tsx metadata: title, description, OG, Twitter card — all Flatrun-branded.
- Resolved Next.js 16 + Turbopack import issue for the engine package:
  - First attempt: relative import path. Rejected by Turbopack (packages outside src/ not in scope).
  - Second attempt: transpilePackages + experimental.externalDir + turbopack.resolveAlias. Caused dev server to crash with "webpack config without turbopack config" error (stale state from earlier attempt).
  - Third attempt (worked): symlink src/lib/engine -> packages/reconciliation-engine/src/. Turbopack sees the engine as a local module inside src/. Clean and simple.
- Stripped .js extensions from all internal imports in packages/reconciliation-engine/src/*.ts. NodeNext-style .js extensions are not understood by Turbopack. Engine still works identically under Bun (CLI verified to produce 5 exceptions / ₦1,125,000 variance after the change).
- Verified the page renders correctly via agent-browser:
  - HTTP 200, no console errors, no page errors.
  - Hero shows "Potential discrepancies detected: ₦1,125,000.00" and "5 exceptions across 6 tenants · 6 properties · 6 leases · 37 invoices · 38 payments reviewed".
  - Stat cards show correct values (Expected ₦3,000,000; Billed ₦18,450,000; Collected ₦18,900,000; Total variance ₦1,125,000).
  - Severity cards: 1 critical, 1 high, 3 medium, 0 low.
  - Table sorts correctly (critical first, then by variance).
  - "By type" tab works (clickable, shows cards per exception type).
  - Per-exception cards render the deterministic explanations verbatim from the engine.
  - Responsive: took screenshots at 1440x900 (desktop) and 375x667 (mobile).
- Screenshots saved to /home/z/my-project/download/:
  - flatrun-preview.png (full page, default viewport)
  - flatrun-preview-desktop.png (1440x900)
  - flatrun-preview-mobile.png (375x667)
- Committed as "Engine preview dashboard: visualise reconciliation output before Slice 1" (commit 0a6effc). Pushed to GitHub main.

Stage Summary:
- The user can now see the product visually before any deploy. The dashboard at / shows the actual engine output (not mock data), with all 5 planted exceptions rendered correctly.
- This is a PREVIEW only — it is NOT Slice 4. It uses fixture data, has no auth, has no persistence. Slice 1 will add auth + org; Slice 3 will add upload; Slice 4 will replace this with the live dashboard backed by real imported data.
- The engine package is now imported into the Next.js app via a symlink (cleanest path with Turbopack). Engine internal imports have been cleaned of .js extensions for Turbopack compatibility. Engine functionality is unchanged (CLI still produces 5 exceptions / ₦1,125,000 variance).
- All changes pushed to GitHub at commit 0a6effc.

What Was Built:
- src/lib/preview-data.ts (server-side engine runner)
- src/lib/engine (symlink to packages/reconciliation-engine/src)
- src/app/page.tsx (full dashboard with stat cards, severity cards, tabs, table, exception detail cards)
- src/app/layout.tsx (updated metadata)
- next.config.ts, tsconfig.json, package.json (configuration for engine import)
- packages/reconciliation-engine/src/*.ts (stripped .js extensions from imports)

What Was Tested:
- bun run lint — passes clean.
- bun run packages/reconciliation-engine/cli/reconcile.ts test/fixtures — produces correct 5-exception report.
- agent-browser open http://localhost:3000 — page loads, HTTP 200, no errors.
- agent-browser snapshot — verified all sections rendered with correct values.
- agent-browser click on "By type" tab — tab switches correctly.
- agent-browser screenshot at desktop and mobile viewports — responsive layout confirmed.

What Passed:
- Engine output matches planted discrepancies exactly (5 exceptions, ₦1,125,000 variance).
- Dashboard renders all sections with correct data.
- No runtime errors, no console errors.
- Tabs are interactive.
- Layout is responsive.

What Failed:
- Initial attempts to import the engine package via Turbopack config (transpilePackages, externalDir, resolveAlias) caused dev server crashes. Fixed by using a symlink instead.
- Initial engine imports used NodeNext-style .js extensions which Turbopack doesn't support. Fixed by stripping .js from all internal imports.

What Remains:
- Slice 1 (auth + organisation + dashboard empty state) — not started. User must complete Sentry + Render setup first.
- Slice 3 (CSV upload) — not started.
- Slice 4 (live dashboard backed by real data) — not started. This preview will be replaced by Slice 4.

Decisions Requiring User Approval:
- The symlink approach (src/lib/engine -> packages/reconciliation-engine/src) is a pragmatic workaround for Turbopack's package resolution limits. In production, we'd either publish the engine as a real npm package or use a proper workspace setup. For the MVP, the symlink is fine. Document for future migration.

Next Action: User reviews the preview at the deployed URL or via the screenshots, then proceeds with Sentry + Render setup (Step 2), then says "ready for Slice 1".
