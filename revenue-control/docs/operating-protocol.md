# Operating Protocol

> **Status:** Authoritative. This document defines how the engineering team (human + AI) works on Revenue Control. It overrides any contrary agent instinct.

---

## 1. Hierarchy of Authority

When making any decision, defer to the highest authority on this list:

1. **Explicit user instruction** in the current conversation.
2. **`/docs/product-brief.md`** — the product specification.
3. **Approved architecture decisions** in `/docs/architecture.md`, `/docs/database-schema.md`, `/docs/reconciliation-rules.md`.
4. **Existing implementation** (where it doesn't conflict with the above).
5. **Agent assumptions** (lowest authority — never override a higher source).

Rules:

* **Never silently change product scope.** If an implementation conflicts with the brief, stop, identify the conflict, and resolve it before continuing.
* **If you believe a brief requirement should change**, propose the change in the chat with rationale. Do not implement the change unilaterally.
* **Never add a major feature simply because it appears technically useful.** Note it in `docs/future-considerations.md` (created if needed) and move on.
* **When a requirement is ambiguous**, identify the ambiguity explicitly and choose the safest minimal implementation. Note the assumption in the worklog. Do not invent scope.

---

## 2. The Build Loop

Every unit of work follows this loop. No exceptions.

```
PLAN
 ↓
IMPLEMENT
 ↓
TEST
 ↓
INSPECT
 ↓
FIX
 ↓
DOCUMENT
 ↓
COMMIT
 ↓
NEXT
```

### PLAN
* Before writing code, state what you're about to build and why.
* Identify which slice it belongs to.
* Identify any ambiguity in the brief that affects this work.
* Write the plan into the worklog before starting.

### IMPLEMENT
* Write the smallest code that satisfies the plan.
* No speculative generality. No "while I'm here, let me also..." additions.
* No placeholder functionality presented as complete.

### TEST
* Run the existing test suite.
* Add tests for the new code (unit + integration + E2E as appropriate).
* Tests must pass before moving on.

### INSPECT
* Read the diff yourself before considering the work done.
* Does the code match the plan?
* Does the code match the brief?
* Are there obvious bugs?
* Did scope creep in?

### FIX
* If INSPECT found issues, fix them.
* If a test fails, fix the code (not the test, unless the test was wrong).

### DOCUMENT
* Update `/docs/*` if the implementation revealed an architecture decision worth recording.
* Update the worklog with what was built, what was tested, what passed, what failed, what remains.
* If the brief needs to change, raise it in the chat (do not edit the brief yourself).

### COMMIT
* Commit with a descriptive message: `slice-N: short description of what was done`.
* The commit should be reviewable in isolation.

### NEXT
* Only after the loop is complete, move to the next unit of work.
* Never carry forward incomplete work without an explicit note in the worklog.

---

## 3. Anti-Patterns (forbidden)

* **The "100,000 lines of code" response.** Build incrementally. Stop after each unit. Verify. Continue.
* **"It compiles, so it works."** Tests are the verification, not the compiler.
* **"I'll add tests later."** No. Tests come with the code in the same slice.
* **"This feature will be useful eventually."** If it's not in the brief, it's not in the MVP. Note it in `docs/future-considerations.md` and move on.
* **"The AI should figure out the financial math."** No. Deterministic software establishes financial truth. AI interprets ambiguity only.
* **"Let me build the whole dashboard so it looks impressive."** No. Build the smallest vertical slice that proves the engine works first.
* **"The brief probably meant..."** No. If the brief is ambiguous, ask. Don't guess.
* **Silent scope changes.** No. Always propose first.
* **Replacing deterministic logic with AI "to make it smarter."** No. The brief explicitly forbids this.
* **Skipping the worklog.** No. The worklog is how we maintain state across slices and across agent sessions.

---

## 4. Worklog Discipline

The worklog at `/home/z/my-project/worklog.md` is the shared state across all agents and slices.

* **Before starting work**, read the worklog to understand what previous slices have done.
* **After finishing a unit of work**, append (do not overwrite) a new section with the following template:

```markdown
---
Task ID: <slice-N or sub-task ID>
Agent: <agent name>
Task: <what was asked to do>

Work Log:
- <concrete step 1>
- <concrete step 2>
- ...

Stage Summary:
- <key results / decisions / produced artifacts>
- <what passed / what failed>
- <what remains>
- <any decisions requiring user approval>
```

* The worklog is the source of truth for "where are we in the build." If the worklog doesn't say it's done, it's not done.
* The worklog is append-only. Never edit a previous entry. If you need to correct something, add a new entry.

---

## 5. Reporting At End Of Each Slice

At the end of every slice, report (per brief Section 29):

1. **What was built.**
2. **What was tested.**
3. **What passed.**
4. **What failed.**
5. **What remains.**
6. **Any architectural/product decisions that require approval.**

The report goes both in the worklog and in the chat to the user. The user must approve before the next slice starts.

---

## 6. Source of Truth Rule

From this point forward, `/docs/product-brief.md` is the source of truth for product scope.

* If implementation conflicts with the specification, stop and identify the conflict.
* If you believe a requirement should change, propose the change and explain why before implementing it.
* Never add a major feature simply because it appears technically useful.

This rule saves the project from chaos. The brief is short, the conversation is long, and the agent's memory of the conversation is imperfect. The brief is the anchor.

---

## 7. The "First Real Milestone" Principle

The first thing we prove is not a beautiful dashboard. It is:

> **Five CSVs in → reconciliation report out.**

If that doesn't work, the UI is irrelevant.

Slice 2 (the engine + CLI) is the gate. No UI for upload or reconciliation is built until Slice 2 passes. The engine must reliably detect the six exception types on the realistic test fixtures with planted discrepancies.

This principle exists because pretty dashboards built on broken engines are the most common failure mode of AI-generated products. We refuse that failure mode.

---

## 8. Realistic Test Data

The test fixtures in `packages/reconciliation-engine/test/fixtures/` are not AI-generated random data. They are deliberately constructed to mirror a Nigerian real-estate operator:

* 50 properties across Lagos, Abuja, Port Harcourt
* 500 tenants
* 600 leases (mix of monthly/quarterly/annual; ~40% with percentage escalations, 10% fixed-amount, 50% none)
* 5,000 invoices spanning 24 months
* 4,800 payments

With planted discrepancies:

| Tenant | Planted issue |
|---|---|
| A | Clean — no exceptions |
| B | Underbilling (one period underbilled) |
| C | Missed escalation (anniversary passed, billing didn't update) |
| D | Underpayment (invoice partially paid) |
| E | Unallocated payment (no clear invoice match) |
| F | Duplicate invoice (two invoices for same period/amount) |

The engine's report must match these planted discrepancies. If it doesn't, the engine is wrong, not the test.

---

## 9. Decision Log

When the user approves the 8 questions in the chat, the answers are recorded as a decision log entry in this file (Section 11 below). The decisions are then propagated to the relevant docs (architecture.md, etc.) as needed.

Decisions that emerge during implementation (e.g., "we chose library X over Y for reason Z") are added to Section 11 as they happen.

---

## 10. Quick Reference: The 8 Approval Questions

These were raised in the technical planning pass and remain open. The plan cannot move to Slice 0 until they're answered.

1. **Tech stack** — NestJS + Next.js + PostgreSQL + Redis + S3 + JWT auth. Preference on auth provider?
2. **Monorepo vs separate repos** — proposed pnpm workspace monorepo.
3. **Auth provider** — build vs buy? (Recommended: buy — Clerk or Auth0.)
4. **Currency handling for MVP** — detect mismatch at validation, flag as invalid, defer cross-currency. Confirm?
5. **Conflicting leases edge case** — (a) 7th exception type, (b) validation error blocking import, or (c) system warning. Proposed (c).
6. **AI provider** — OpenAI, Anthropic, in-house? Proposed OpenAI default with abstraction port.
7. **Deployment target** — AWS, GCP, managed platform (Render/Railway)? Proposed Render for MVP, AWS for production.
8. **Scope confirmation** — nothing in the "Future Features — Do Not Build Now" list will be built. Confirm.

---

## 11. Decision Log

(To be populated as decisions are made.)

```
[YYYY-MM-DD] Decision: <one-line summary>
  Context: <why this came up>
  Options considered: <A / B / C>
  Choice: <chosen option>
  Rationale: <why>
  Affects: <which docs need updating>
```
