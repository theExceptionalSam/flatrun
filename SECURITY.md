# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Flatrun, please report it
responsibly. **Do not open a public GitHub issue.**

### How to report

Send an email to **security@flatrun.io** with the following information:

1. **Summary** — a one-line description of the vulnerability.
2. **Affected component** — which part of the system (engine, auth, API, web app, file upload, etc.).
3. **Severity** — your assessment: Critical / High / Medium / Low. If unsure, leave blank.
4. **Reproduction steps** — the minimum steps to reproduce the issue. Include any non-sensitive code, requests, or screenshots.
5. **Impact** — what an attacker could do if they exploited this vulnerability.
6. **Suggested fix** — optional. If you have a fix in mind, share it.

You should receive an acknowledgment within **48 hours**. Please allow up to
**7 days** for a triage response with severity assessment and remediation plan.

### Scope

The following are **in scope** for security reports:

- Authentication bypass (signup, login, password reset, session tokens)
- Authorisation bypass (cross-tenant data access, privilege escalation, role bypass)
- Injection vulnerabilities (SQL, command, XSS)
- Sensitive data exposure (API responses, error messages, logs, source code)
- File upload vulnerabilities (malicious file handling, path traversal, unrestricted file types)
- Denial of service vectors (resource exhaustion via upload, reconciliation, or AI calls)
- Vulnerabilities in third-party dependencies (reportable if exploitable in our context)

The following are **out of scope**:

- Reports from automated scanners without a working proof of concept
- Theoretical vulnerabilities without a demonstrable attack path
- Social engineering attacks against Flatrun maintainers
- Physical attacks against Flatrun infrastructure
- Reports about the website's content, design, or copy
- Vulnerabilities in services we do not control (GitHub, Render, Clerk, OpenAI, Sentry)

### Reward

Flatrun does not currently operate a paid bug bounty program. We will
acknowledge responsible disclosure in our release notes if you wish.

## Security Architecture

The full security design is documented in [`docs/security.md`](./docs/security.md).
Key principles:

- **Three-layer tenancy isolation**: application-level `organisation_id` filtering,
  database-level Row-Level Security, and audit-layer verification.
- **No deterministic financial logic is delegated to AI.** AI only interprets
  ambiguity; it cannot modify financial records or transition exception states.
- **All mutations are audited** with actor, action, entity, previous state,
  new state, IP, user agent, and timestamp.
- **Idempotency keys** on every mutating endpoint that can be retried.
- **Encrypted in transit** (TLS 1.2+) for all connections. At rest, encryption
  is provided by the cloud provider (Render PostgreSQL / AWS RDS in production).

## Disclosure Policy

- We acknowledge receipt within 48 hours.
- We provide a triage assessment within 7 days.
- We work with you on a coordinated disclosure timeline (typically 30–90 days
  from initial report to public disclosure, depending on severity and fix
  complexity).
- We credit reporters in release notes unless they prefer to remain anonymous.

## Supported Versions

Flatrun is in active MVP development. Security fixes are applied to the
`main` branch and deployed to production. There are no separate versioned
release lines at this time.

| Version | Supported          |
|---------|--------------------|
| main    | :white_check_mark: |
| Other   | :x:                |

## Contact

For anything security-related, use **security@flatrun.io**. For non-security
questions, use the regular maintainers contact in [CONTRIBUTORS.md](./CONTRIBUTORS.md).
