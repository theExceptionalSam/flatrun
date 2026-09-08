# REVENUE CONTROL — Master Product Brief & Build Specification

> **Source of truth.** This document is the authoritative specification for the Revenue Control MVP. Every product decision, scope debate, and architectural choice must defer to this document. If a requirement in this document conflicts with implementation, the implementation is wrong. If a requirement here should change, that change must be proposed explicitly before being implemented — never silently.

---

## 1. PRODUCT VISION

Revenue Control is the first product in a larger Real Estate Execution OS.

The long-term vision is to become the intelligent execution and control layer for real-estate organisations.

The MVP does NOT attempt to build the entire Real Estate Execution OS.

The MVP focuses on one specific problem:

> Real-estate finance/property-management teams struggle to continuously reconcile contractual revenue obligations, billing records and actual payments, causing financial discrepancies and revenue leakage to remain hidden inside spreadsheets, accounting systems and fragmented operational data.

Revenue Control automates this reconciliation process and turns discrepancies into actionable exceptions.

---

## 2. PROBLEM

Real-estate companies maintain information across:

* leases
* tenant records
* property records
* billing systems
* invoices
* payment records
* accounting systems
* spreadsheets

The finance team must determine:

1. What should have been billed?
2. What was actually billed?
3. What should have been collected?
4. What was actually collected?
5. What does not match?
6. Why does it not match?
7. Which discrepancies matter most?
8. Who needs to investigate?
9. Has the issue been resolved?

Manual reconciliation is slow, repetitive and prone to missed discrepancies.

The product exists to automate this control process.

---

## 3. EXACT PROBLEM BEING SOLVED

The MVP solves:

> Automated reconciliation and exception detection between lease obligations, billing records and payment records.

The core transformation is:

BEFORE:

```
Data → spreadsheets → manual comparison → investigation → follow-up
```

AFTER:

```
Data → automated reconciliation → exception detection → evidence → action → resolution
```

---

## 4. PRIMARY USER

The primary user is:

> Property Finance Manager / Property Accountant working for a real-estate operator or property-management company managing a substantial portfolio of income-producing properties.

Their job is to ensure that property revenue is correctly billed, collected, reconciled and reported.

They are NOT trying to use AI.

They are trying to:

> Know what does not match, understand why, quantify the financial impact and resolve it.

---

## 5. SECONDARY USERS

### CFO / Head of Finance
Needs portfolio-level visibility into financial discrepancies.

### Property Manager
Needs to investigate tenant/property-level issues.

### Finance Analyst
Needs to review, investigate and resolve individual exceptions.

### Executive
Needs high-level financial risk and exception visibility.

---

## 6. CORE USER OUTCOME

The user should be able to:

1. Create an organisation.
2. Upload portfolio data.
3. Map uploaded fields to Revenue Control fields.
4. Validate the data.
5. Run reconciliation.
6. See the total value of detected discrepancies.
7. See exceptions categorised by type and severity.
8. Open an exception.
9. Understand why it was detected.
10. See the evidence supporting the exception.
11. Assign/review/dismiss/resolve the exception.
12. Record the resolution.

The critical "aha" moment is:

> "This system found a financial discrepancy I would otherwise have had to find manually."

---

## 7. MVP DATA SOURCES

The first MVP should use file uploads rather than complex third-party integrations.

Supported formats:
* CSV
* XLSX

Required datasets:

### Properties
* property_id
* property_name
* address
* property_type

### Tenants
* tenant_id
* tenant_name
* property_id

### Leases
* lease_id
* tenant_id
* start_date
* end_date
* rent_amount
* currency
* frequency
* escalation

### Billing
* invoice_id
* tenant_id
* invoice_date
* amount
* billing_type

### Payments
* payment_id
* tenant_id
* payment_date
* amount
* payment_reference

---

## 8. CORE RECONCILIATION ENGINE

The engine must compare expected financial obligations against actual billing/payment records.

The engine must be deterministic wherever mathematical accuracy is involved.

AI must NOT be responsible for basic financial calculations.

Use normal application logic for:
* expected rent
* escalation calculations
* billing totals
* payment totals
* variances
* date calculations
* matching rules

AI may be used for:
* document interpretation
* lease clause extraction
* anomaly explanation
* ambiguous record matching
* natural-language explanations

Principle:

> Deterministic software establishes financial truth. AI interprets and assists with ambiguity.

---

## 9. MVP EXCEPTION TYPES

Implement only these initial exception types:

### 1. Underbilling
Expected amount > billed amount.

### 2. Missing billing
A financial obligation exists but expected billing is absent.

### 3. Underpayment
Billed amount > matched payment amount.

### 4. Unallocated payment
A payment exists but cannot confidently be matched to the correct tenant/invoice.

### 5. Missed escalation
The lease indicates a rent escalation but billing does not reflect the expected increase.

### 6. Duplicate/anomalous billing
Potential duplicate or suspicious billing record.

Do not build additional exception types until these six work reliably.

---

## 10. EXCEPTION OBJECT

Every exception should contain:

* exception_id
* organisation_id
* exception_type
* severity
* status
* financial_variance
* tenant
* property
* lease
* source_records
* explanation
* confidence
* assigned_user
* created_at
* updated_at
* resolution
* resolution_reason
* resolution_notes

Every exception must be traceable to source data.

Never generate an unexplained financial claim.

---

## 11. EXCEPTION STATUSES

Use:
* Open
* Investigating
* Resolved
* Dismissed

---

## 12. CORE ACTIONS

Users must be able to:
* assign
* comment
* investigate
* dismiss
* resolve
* record resolution reason
* add notes
* view evidence

---

## 13. MVP SCREENS

Build these screens only.

1. Login
2. Sign up
3. Organisation onboarding
4. Dashboard
5. Data Sources
6. Upload Data
7. Data Mapping
8. Data Validation
9. Reconciliation Processing
10. Exceptions
11. Exception Detail
12. Resolution
13. Basic Settings

Do not build a mobile application.

Build a responsive web application.

---

## 14. DASHBOARD

The dashboard must answer:
1. How much potential discrepancy has been detected?
2. How many exceptions exist?
3. What types of exceptions exist?
4. Which exceptions are highest priority?
5. What requires attention?

Example:
```
Potential discrepancies: ₦18.4m

147 total exceptions

32 high priority

71 medium

44 low
```

Then show exception categories and highest-value exceptions.

The dashboard is a control surface, not a generic analytics dashboard.

---

## 15. EXCEPTION DETAIL

This is the most important screen.

It must show:
* what was expected
* what actually happened
* variance
* why it was flagged
* relevant lease/billing/payment information
* supporting evidence
* calculation logic
* confidence level
* action controls
* history

The user must be able to understand the exception without opening another spreadsheet.

---

## 16. DATA IMPORT FLOW

The import flow must be:

```
UPLOAD → DETECT COLUMNS → MAP FIELDS → PREVIEW → VALIDATE → IMPORT → RECONCILE
```

If data is invalid, clearly explain the problem.

Never silently discard data.

Support partial imports.

Example:
```
9,842 records imported successfully.
158 records require attention.
```

---

## 17. EDGE CASES

The system must explicitly handle:

### No data
Show a useful empty state. Do not display misleading zero-value analytics.

### Missing fields
Explain exactly which fields are missing.

### Duplicate records
Detect and flag potential duplicates.

### Invalid data types
Prevent invalid mappings.

### Conflicting records
Create an exception rather than silently choosing one source.

### Unmatched payment
Classify as unallocated payment.

### Partial import
Allow valid records to continue while showing invalid records separately.

### Failed processing
Allow retry without creating duplicate records.

### API failure
For future integrations, preserve last successful sync and show sync status.

### Duplicate API events
Use idempotency.

### False positive
Allow the user to dismiss an exception and record why.

---

## 18. SECURITY

Implement from the beginning:
* organisation-level data isolation
* role-based access control
* secure authentication
* encrypted connections
* secure file storage
* audit logging
* protected secrets
* input validation
* rate limiting
* safe file handling

Users from Organisation A must never be able to access Organisation B's data.

---

## 19. AUDIT LOGGING

Record important actions:
* who
* action
* object
* timestamp
* previous state
* new state

Example:
> "Finance Manager changed exception EX-1029 from Open to Resolved."

---

## 20. RECOMMENDED TECHNICAL STACK

Frontend:
* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui

Backend:
* TypeScript
* NestJS

Database:
* PostgreSQL

File storage:
* S3-compatible object storage

Authentication:
* enterprise-ready authentication provider supporting future SSO/MFA/RBAC

Background processing:
* queue/job architecture suitable for long-running imports and reconciliation

AI:
* LLM API behind an abstraction layer
* never tightly couple the application to one model provider

Deployment:
* production-grade cloud deployment
* separate development/staging/production environments

---

## 21. ARCHITECTURE PRINCIPLE

```
USER
 ↓
WEB APPLICATION
 ↓
API
 ↓
APPLICATION SERVICES
 ↓
DOMAIN / RECONCILIATION ENGINE
 ↓
DATABASE
```

Separate:
* authentication
* data ingestion
* reconciliation
* exception management
* AI services
* audit logging
* integrations

Do not create a monolithic codebase where all logic is mixed together.

---

## 22. AI PRINCIPLES

AI is an assistant to the product's deterministic control system.

AI must never:
* invent financial figures
* invent lease clauses
* invent evidence
* silently modify financial records
* override deterministic calculations
* automatically resolve financial exceptions without authorisation

AI outputs should reference source records wherever possible.

---

## 23. FUTURE FEATURES — DO NOT BUILD NOW

Do not implement:
* maintenance management
* tenant portal
* property listings
* CRM
* vendor marketplace
* automated payment processing
* full accounting
* valuation engine
* transaction management
* WhatsApp automation
* autonomous AI agents
* predictive maintenance
* portfolio forecasting
* broad PMS functionality
* native integrations unless required for the first pilot

These belong to later phases.

---

## 24. FUTURE PRODUCT DIRECTION

The MVP is the foundation for:

```
Revenue Control
 → Lease Intelligence
 → Transaction Execution
 → Property Operations
 → Compliance
 → Portfolio Intelligence
 → Real Estate Execution OS
```

The underlying data model should therefore be designed for future expansion without building those features now.

---

## 25. SUCCESS METRICS

Primary:
### Time to first verified financial insight
Measure: Signup → successful data import → reconciliation → first meaningful exception.

Secondary:
* reconciliation success rate
* exception precision
* false-positive rate
* time spent investigating exceptions
* exceptions resolved
* financial discrepancy identified
* financial value recovered/confirmed
* percentage of workflow completed without manual reconciliation

---

## 26. DEFINITION OF DONE

The MVP is complete only when a real user can:

1. Sign up.
2. Create an organisation.
3. Upload CSV/XLSX portfolio data.
4. Map the data.
5. Validate it.
6. Successfully import it.
7. Run reconciliation.
8. Receive reliable results.
9. See detected discrepancies.
10. Open an exception.
11. Understand the reason for the exception.
12. Inspect the evidence.
13. Assign or investigate it.
14. Resolve or dismiss it.
15. Record the resolution.
16. Return later and see the updated state.

The system must handle bad data, duplicates, missing data and failed processing without corrupting financial records.

The MVP must work end-to-end using realistic test data.

---

## 27. PRODUCT PRINCIPLE

Do not optimise for number of features.

Optimise for:

> Data → Truth → Exception → Evidence → Action → Resolution.

If a feature does not strengthen this loop, it probably does not belong in the MVP.

---

## 28. BUILD ORDER

Build in this order:

* PHASE 1 — Project foundation
* PHASE 2 — Authentication + organisation
* PHASE 3 — Database + core data model
* PHASE 4 — CSV/XLSX ingestion
* PHASE 5 — Data mapping + validation
* PHASE 6 — Reconciliation engine
* PHASE 7 — Exception generation
* PHASE 8 — Dashboard
* PHASE 9 — Exception detail + evidence
* PHASE 10 — Resolution workflow
* PHASE 11 — Audit logging
* PHASE 12 — Testing + edge cases
* PHASE 13 — Production hardening

Do not skip ahead.

After each phase, verify that the application works before continuing.

> **Implementation note:** The detailed vertical-slice execution plan that respects this build order is in `build-slices.md`. The build order above is the spec; the slices are how we ship it in working increments.

---

## 29. AGENT BEHAVIOUR

You are the senior engineering team responsible for implementing this product.

* Do not invent major product requirements.
* Do not expand scope without explicit approval.
* Do not replace deterministic financial logic with AI.
* Do not build placeholder functionality and present it as complete.
* When a requirement is ambiguous, identify the ambiguity and choose the safest minimal implementation unless clarification is essential.
* Prioritise correctness, auditability, security and maintainability over visual complexity.
* Before writing substantial code, create the implementation plan and architecture.
* Build incrementally.
* Run tests after each meaningful implementation.
* Do not declare the MVP complete until the Definition of Done has been verified.

At the end of every development phase, report:
1. What was built.
2. What was tested.
3. What passed.
4. What failed.
5. What remains.
6. Any architectural/product decisions that require approval.

---

# END OF MASTER BRIEF
