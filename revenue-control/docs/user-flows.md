# User Flows

> **Status:** Approved.
> **Source of truth:** `/docs/product-brief.md` Section 6 (Core user outcome), Section 13 (Screens), Section 16 (Import flow).

---

## 1. Primary End-to-End Flow

```
Signup
 → Create organisation
 → (Optional) invite team members with roles
 → Land on dashboard (empty state)
 → Upload first dataset (properties)
 → Detect columns automatically
 → Map uploaded columns → canonical schema
 → Preview mapped rows
 → Validate (type, range, referential, duplicates)
 → Import (partial allowed)
 → Repeat for tenants, leases, billing, payments
 → Trigger reconciliation run
 → Watch run status (running → completed)
 → Land on dashboard with real numbers
 → Open a high-priority exception
 → See: expected vs actual vs variance vs evidence vs confidence
 → Assign / comment / investigate
 → Resolve with reason OR Dismiss with reason
 → Audit log records every state change
 → Return later; state persists; new uploads trigger incremental reconciliation
```

The flow is intentionally linear and stateful. Every action mutates persisted state. Every mutation is audited.

---

## 2. The Five Vertical Slice Flows

These are the flows we build and ship one at a time. Each is a complete end-to-end path through the stack.

### Slice 1 — Signup → Organisation → Dashboard

```
User opens app
 → Sign-up form (email, password, name)
 → Account created in auth provider
 → User prompted to create organisation (name, slug)
 → Organisation created, user is `owner`
 → (Optional) invite second user with role
 → Land on dashboard with empty state
 → "Upload your first dataset" call-to-action
```

**What this proves:** Multi-tenancy works end-to-end. Two users in two orgs cannot see each other's data.

### Slice 2 — CSV in → Reconciliation report (the core)

> This slice is **THE** first real milestone. No UI is built for the upload flow yet. The engine + a CLI are demonstrable independently.

```
Five CSVs in /fixtures/
 → CLI: pnpm reconcile <fixtures-dir>
 → Engine loads + normalises
 → Six rules run in fixed order
 → Report printed:
     Records processed: 10,482
     Expected revenue: ₦XXX
     Billed revenue:   ₦XXX
     Collected revenue: ₦XXX
     Exceptions: 137
       Underbilling:             ₦X (n cases)
       Missing billing:          ₦X (n cases)
       Underpayment:             ₦X (n cases)
       Unallocated payments:     ₦X (n cases)
       Missed escalations:       ₦X (n cases)
       Duplicate/anomalous billing: ₦X (n cases)
```

The fixtures have deliberately planted discrepancies (Tenant A correct, B underbilling, C missed escalation, D underpayment, E unallocated, F duplicate). The report must match the planted set. **If this doesn't work, no UI gets built.**

### Slice 3 — Upload CSV → Map → Validate → Import

```
User on Data Sources page
 → "Upload data" → file picker (CSV/XLSX, max 50 MB)
 → File stored in S3, parse begins in background
 → Column auto-detection
 → Mapping UI: user maps each detected column → canonical field
 → Preview 10 sample rows post-mapping
 → Validate (full file)
   - Type checks
   - Range checks
   - Referential integrity (lease.tenant_id must exist)
   - Uniqueness (no duplicate external_id within file)
 → Import result:
   - 9,842 records imported successfully
   - 158 records require attention (with per-row reasons)
 → Invalid records retained in import_jobs.invalid_records (not silently dropped)
 → Re-upload of same external_id → upsert (not duplicate)
```

**What this proves:** Data ingestion works at scale, with bad data handled safely.

### Slice 4 — Engine wired into API → Exceptions persisted → Dashboard + List + Detail

```
User triggers reconciliation from UI (or auto-triggered after import)
 → API enqueues reconciliation job (BullMQ)
 → Worker loads records for run scope
 → Worker calls packages/reconciliation-engine
 → Engine returns exception drafts
 → Worker persists exceptions transactionally
 → Run completes; summary updated
 → Dashboard now shows real numbers:
     Potential discrepancies: ₦18.4m
     147 total exceptions (32 high, 71 medium, 44 low)
 → User clicks "Exceptions" in nav
 → Exception list with filters (type, severity, status, tenant, property)
 → User opens an exception
 → Exception detail:
   - Expected vs actual vs variance
   - Why it was flagged (deterministic explanation)
   - Source records (lease, invoices, payments — the actual rows)
   - Calculation logic breakdown
   - Confidence level
   - Action controls (assign, comment, investigate, resolve, dismiss)
   - History (chronological events)
```

**What this proves:** The user can understand an exception fully without opening another spreadsheet.

### Slice 5 — Resolution Workflow + Audit

```
User on exception detail
 → Assign to self or another user (audit log entry: "assigned to X by Y")
 → Add comment (audit log entry)
 → Status: open → investigating (audit log entry)
 → Resolve with reason + notes (audit log entry: "resolved by X with reason Y")
   OR
 → Dismiss with reason + notes (audit log entry)
 → Exception is NOT deleted; it remains with status resolved/dismissed
 → User can reopen if needed
 → Bulk actions: select multiple exceptions, assign or dismiss with shared reason
 → Admin can view audit log viewer (admin-only)
```

**What this proves:** The full Data → Truth → Exception → Evidence → Action → Resolution loop works, with every action traceable.

---

## 3. Secondary Flows (within the MVP scope)

### Executive view
A `viewer`-role user lands on dashboard. Sees the same five numbers (money, risk, execution, performance, attention). Cannot drill into individual exceptions (read-only). Cannot trigger reconciliation.

### Property manager view
A `finance_manager` or `analyst` user filters exceptions by property. Sees only the exceptions for properties they're assigned to (in MVP, assignment is org-wide; per-property scoping is a later phase).

### Re-import flow
A user re-uploads a properties file with updated rows. The system upserts by `external_id`. Audit log records every updated row. Reconciliation can be re-run on the updated scope.

---

## 4. Out-of-Scope Flows (do not build)

* Mobile application
* Tenant portal
* Tenant chat / WhatsApp
* Vendor portal
* Approval workflows outside the exception lifecycle
* Custom dashboard builder
* Saved views / reports (deferred)
* Public API for third parties
* API integrations with Yardi / MRI / Salesforce / SAP / bank feeds
* Automated payment processing
* Predictive maintenance or forecasting
* Lease abstraction from PDFs (deferred; architecture allows it later)

These are listed in `product-brief.md` Section 23. If during implementation any of these is tempted, stop and propose the change before building it.
