# Database Schema

> **Status:** Proposed. Implementation pending approval.
> **Source of truth:** `/docs/product-brief.md` Section 10 (Exception object) and Section 18 (Security).

---

## 1. Conventions

* **Engine:** PostgreSQL 16+.
* **Primary keys:** UUIDs (`gen_random_uuid()`).
* **Foreign keys:** All FKs are explicit and `ON DELETE RESTRICT` unless noted.
* **Timestamps:** `TIMESTAMPTZ`, stored in UTC.
* **Money:** `NUMERIC(18,2)`. Never floating point. Never `INTEGER` for currency.
* **Currency:** `CHAR(3)` ISO 4217.
* **Multi-tenancy:** Every tenant-scoped table has `organisation_id UUID NOT NULL REFERENCES organisations(id)`.
* **RLS:** Row-Level Security policies on every tenant-scoped table. The application connects with a role that has `current_setting('app.organisation_id')` set per request; RLS policies filter on that setting.
* **Soft delete:** Only `organisations` (regulatory retention). All other entities use hard delete or status flags.
* **Audit columns:** Every table has `created_at`, `updated_at`. Mutations update `updated_at` via trigger.

---

## 2. Tenancy & Identity

```sql
CREATE TYPE user_role AS ENUM ('owner', 'finance_manager', 'analyst', 'viewer');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'revoked');

CREATE TABLE organisations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT,                    -- NULL if auth is external (Clerk/Auth0)
  external_id   TEXT,                    -- ID from auth provider if external
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organisation_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  role            user_role NOT NULL,
  status          membership_status NOT NULL DEFAULT 'invited',
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at       TIMESTAMPTZ,
  UNIQUE (user_id, organisation_id)
);

CREATE INDEX ON organisation_memberships (organisation_id);
CREATE INDEX ON organisation_memberships (user_id);
```

---

## 3. Source Data

```sql
CREATE TYPE data_source_format AS ENUM ('csv', 'xlsx');
CREATE TYPE data_source_status AS ENUM ('uploaded', 'parsed', 'failed', 'archived');

CREATE TYPE import_dataset AS ENUM ('properties', 'tenants', 'leases', 'billing', 'payments');
CREATE TYPE import_job_status AS ENUM (
  'pending', 'detecting', 'awaiting_mapping', 'validating',
  'importing', 'completed', 'partial', 'failed'
);

CREATE TABLE data_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id),
  name              TEXT NOT NULL,
  format            data_source_format NOT NULL,
  storage_key       TEXT NOT NULL,                 -- S3 object key
  row_count_total   INTEGER,
  row_count_valid   INTEGER,
  row_count_invalid INTEGER,
  status            data_source_status NOT NULL DEFAULT 'uploaded',
  checksum          TEXT,
  uploaded_by       UUID REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id),
  data_source_id    UUID NOT NULL REFERENCES data_sources(id),
  dataset           import_dataset NOT NULL,
  status            import_job_status NOT NULL DEFAULT 'pending',
  column_mapping    JSONB,                          -- { source_column: canonical_field }
  validation_report JSONB,                          -- { valid_count, invalid_count, errors[] }
  invalid_records   JSONB,                          -- [{ row_number, row_data, errors[] }]
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX ON import_jobs (organisation_id, status);
```

---

## 4. Portfolio

```sql
CREATE TYPE lease_frequency AS ENUM ('monthly', 'quarterly', 'semi_annual', 'annual');
CREATE TYPE lease_status AS ENUM ('future', 'active', 'expired', 'terminated');
CREATE TYPE escalation_type AS ENUM ('none', 'percentage', 'fixed_amount');

CREATE TABLE properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  address         TEXT,
  property_type   TEXT,
  raw_metadata    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, external_id)
);

CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_email   TEXT,
  contact_phone   TEXT,
  raw_metadata    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, external_id)
);

CREATE TABLE leases (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             UUID NOT NULL REFERENCES organisations(id),
  external_id                 TEXT NOT NULL,
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  property_id                 UUID NOT NULL REFERENCES properties(id),
  start_date                  DATE NOT NULL,
  end_date                    DATE,                    -- NULL = open-ended
  rent_amount                 NUMERIC(18,2) NOT NULL,
  currency                    CHAR(3) NOT NULL,
  frequency                   lease_frequency NOT NULL,
  escalation_type             escalation_type NOT NULL DEFAULT 'none',
  escalation_rate             NUMERIC(8,4),           -- 0.05 for 5% percentage; ₦ amount for fixed_amount
  escalation_frequency_months INTEGER,               -- 12, 24, etc.
  escalation_start_date       DATE,
  status                      lease_status NOT NULL DEFAULT 'active',
  raw_metadata                JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, external_id)
);

CREATE INDEX ON leases (organisation_id, tenant_id);
CREATE INDEX ON leases (organisation_id, property_id);
CREATE INDEX ON leases (organisation_id, status);
```

---

## 5. Financial Events

```sql
CREATE TYPE billing_type AS ENUM ('rent', 'service_charge', 'other');

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  external_id     TEXT NOT NULL,
  tenant_id       UUID REFERENCES tenants(id),
  lease_id        UUID REFERENCES leases(id),
  invoice_date    DATE NOT NULL,
  period_start    DATE,
  period_end      DATE,
  amount          NUMERIC(18,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  billing_type    billing_type NOT NULL,
  raw_metadata    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, external_id)
);

CREATE INDEX ON invoices (organisation_id, tenant_id);
CREATE INDEX ON invoices (organisation_id, lease_id);
CREATE INDEX ON invoices (organisation_id, invoice_date);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id),
  external_id       TEXT NOT NULL,
  tenant_id         UUID REFERENCES tenants(id),       -- NULL = unknown tenant
  invoice_id        UUID REFERENCES invoices(id),       -- NULL = not allocated
  payment_date      DATE NOT NULL,
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  payment_reference TEXT,
  raw_metadata      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, external_id)
);

CREATE INDEX ON payments (organisation_id, tenant_id);
CREATE INDEX ON payments (organisation_id, invoice_id);
CREATE INDEX ON payments (organisation_id, payment_date);
```

---

## 6. Reconciliation Output

```sql
CREATE TYPE reconciliation_run_status AS ENUM ('running', 'completed', 'failed');
CREATE TYPE exception_type AS ENUM (
  'underbilling', 'missing_billing', 'underpayment',
  'unallocated_payment', 'missed_escalation',
  'duplicate_anomalous_billing'
);
CREATE TYPE exception_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE exception_status AS ENUM ('open', 'investigating', 'resolved', 'dismissed');

CREATE TABLE reconciliation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  scope           JSONB NOT NULL,                    -- { datasets, property_ids, as_of }
  status          reconciliation_run_status NOT NULL DEFAULT 'running',
  summary         JSONB,                             -- { counts_by_type, total_variance }
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  triggered_by    UUID REFERENCES users(id),
  error_message   TEXT
);

CREATE INDEX ON reconciliation_runs (organisation_id, started_at);

CREATE TABLE exceptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES organisations(id),
  reconciliation_run_id UUID NOT NULL REFERENCES reconciliation_runs(id),
  exception_type      exception_type NOT NULL,
  severity            exception_severity NOT NULL,
  status              exception_status NOT NULL DEFAULT 'open',
  financial_variance  NUMERIC(18,2) NOT NULL,
  currency            CHAR(3) NOT NULL,
  tenant_id           UUID REFERENCES tenants(id),
  property_id         UUID REFERENCES properties(id),
  lease_id            UUID REFERENCES leases(id),
  source_records      JSONB NOT NULL,                -- { lease: {...}, invoices: [...], payments: [...] }
  explanation         TEXT NOT NULL,                 -- deterministic, always present
  ai_explanation      TEXT,                          -- LLM-generated, nullable, clearly labelled
  confidence          NUMERIC(3,2) NOT NULL,         -- 0.00 to 1.00
  assigned_user_id    UUID REFERENCES users(id),
  resolution_reason   TEXT,
  resolution_notes    TEXT,
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON exceptions (organisation_id, status);
CREATE INDEX ON exceptions (organisation_id, exception_type);
CREATE INDEX ON exceptions (organisation_id, severity);
CREATE INDEX ON exceptions (organisation_id, tenant_id);
CREATE INDEX ON exceptions (organisation_id, assigned_user_id);

CREATE TYPE exception_event_type AS ENUM (
  'created', 'assigned', 'commented', 'status_changed',
  'resolved', 'dismissed', 'reopened'
);

CREATE TABLE exception_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  exception_id    UUID NOT NULL REFERENCES exceptions(id),
  event_type      exception_event_type NOT NULL,
  actor_id        UUID REFERENCES users(id),         -- NULL for system-generated
  previous_state  JSONB,
  new_state       JSONB,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON exception_events (exception_id, created_at);
```

---

## 7. Cross-Cutting

```sql
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  actor_id        UUID REFERENCES users(id),         -- NULL for system
  action          TEXT NOT NULL,                     -- e.g. "exception.status_changed"
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  previous_state  JSONB,
  new_state       JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_logs (organisation_id, created_at);
CREATE INDEX ON audit_logs (entity_type, entity_id);
```

---

## 8. Row-Level Security (sketch)

Every tenant-scoped table gets:

```sql
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leases
  USING (
    organisation_id = current_setting('app.organisation_id')::uuid
  );
```

The application sets `app.organisation_id` per request after auth, before any query.

---

## 9. Indexing Strategy

* All `(organisation_id, ...)` composite indexes for primary access patterns.
* JSONB columns (`raw_metadata`, `source_records`, `validation_report`) are not indexed in the MVP — query patterns don't require it.
* The `exceptions` table gets the heaviest indexing because it's the most queried.
* A materialised view (or summary table) for dashboard aggregates is added if direct queries become slow at scale (>500k exceptions per org).

---

## 10. Migration Discipline

* Migrations are versioned, forward-only, with explicit rollback scripts.
* Each migration is reviewed and tested on a staging snapshot before production.
* No `DROP COLUMN` without a deprecation period in production. Add the new column, dual-write, backfill, switch reads, then drop later.
