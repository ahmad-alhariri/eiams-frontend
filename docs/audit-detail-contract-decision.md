# EIAMS Audit Detail and Redaction Contract Decision

**Status:** Approved frontend and provisional API contract decision
**Decision ID:** D-AUD-02
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01-t06`
**Decision date:** 2026-08-09

## Decision

Audit is a server-owned, append-only, read-only domain for the frontend. The
browser renders exactly two contract-backed surfaces:

1. a **paginated header read** of audit records with server-side filtering
   (`entityType`, `entityId`, search, date range); and
2. a **field-diff detail read** that returns the audit header plus the ordered,
   per-field changes (`oldValue`/`newValue`) with redaction flags.

Sensitive values are redacted **server-side before** they reach the query
cache, browser memory, or any UI state. `AuditLogEntry.redacted = true`
means the server withheld the raw value; the client never guesses, decrypts,
reconstructs, or reverse-engineers a redacted value, and never requests a
non-redacted variant through client parameters. Redaction is a server policy,
not a client toggle.

The frontend never derives audit content from current entity state, lifecycle
events, stock movements, or `updatedAt` timestamps (D-LIFE-01 keeps lifecycle
and audit separate), and never writes to audit endpoints — the module is
read-only in v1.

## Problem being solved

A government audit system must show *what changed* without leaking raw
credentials, tokens, or internal error data. The PRD (D-AUD-01) fixes the
two-table granularity but not the read projection, the redaction policy, the
pagination boundary, the allowed filters, or the rule that sensitive values
never enter the browser cache. The provisional contract already contains
`AuditLog`/`AuditLogEntry`/`AuditLogPage` with `redacted`, `redactionReasonAr`,
and header filters, but the list endpoint returns full detail (entries
inline), action strings are untyped, field labels are absent, and redaction
semantics are not pinned. Without a decision, features would either render raw
diffs or hide the entire module.

## Governing evidence

| Source | Governing consequence |
| --- | --- |
| PRD §4(5) and D-AUD-01 | Full traceability: every operation records `AuditLog` plus one `AuditLogEntry` per changed field; append-only; two-table granularity. |
| PRD §10 (Audit domain) | Header carries user, entity, action, optional JSONB summary, IP; entries carry `old_value`/`new_value` TEXT serializations. |
| SAD §12 | Distinct contract-backed header and paginated field-diff reads; sensitive values are redacted server-side before reaching query cache or UI state; references this document. |
| SAD §9, D-AUTH-01 | Tokens, passwords, cookie values, and authorization headers never enter audit diffs, error detail, or telemetry. |
| D-LIFE-01 | Lifecycle events are immutable actual transitions with actor snapshots; audit detail is a different ledger; correlation identity links them without mixing. |
| D-OAS-01/02 | The contract must expose redacted list/detail/entry projections, stable error shapes, and typed enums rather than prose. |
| AGENTS.md | Server data belongs to TanStack Query; UI is Arabic-first; tables are server-paginated; forms, errors, and states are Arabic. |
| Architecture Overview §7.2 | Auditor is a read-only role; users see only what their role/scope grants. |

## Read contract

### Header read — `GET /audit-logs`

Server-paginated list of **headers only** (no entry arrays) with
`PageMeta`. Supported query params (`listAuditLogs`):

- `entityType`, `entityId` — filter a specific entity's records;
- `Search` — matches only non-redacted visible text (summary/headline,
  actor display, entity display); never searches raw values, including
  redacted ones;
- `DateFrom`/`DateTo` — occurred-at range.

Order is fixed server-side: `occurredAt` descending, then stable id for
tie-breaking. V1 audit does not expose client sort columns: audit chronology
is an evidence property, not a presentation preference. Any false that the
backend would present is a contract change, not a UI toggle.

## Detail read — `GET /audit-logs/{auditLogId}` (+ paged entries)

Returns the audit header:

- `auditLogId`, `entityType`, `entityId`, `entityDisplay` (Arabic-safe),
- `action` (canonical typed value),
- `summaryAr` (server-built Arabic-safe summary; never contains raw values),
- `occurredAt`, `occurredBy` (historical actor snapshot),
- `traceId` and any correlation identity,
- ordered `entries` for the field diff.

The field-diff collection of one audit operation is bounded by the number of
fields the operation changed (D-AUD-01's one-row-per-field model), so v1
returns entries inline. The OpenAPI contract must nevertheless declare the
envelope with them and must state the cap; if a ratified backend finds an
unbounded detail case, it must publish a dedicated paged entries endpoint
instead of growing this response.

Each `AuditLogEntry` exposes:

- `fieldName` — the stable camelCase contract/property name;
- `oldValue`/`newValue` — TEXT serialization, absent/omitted entirely when
  `redacted = true`;
- `redacted` — boolean flag;
- `redactionReasonAr` — Arabic explanation when redacted.

## Redaction policy

The server redacts a value when it is:

- a credential or token of any kind (passwords, refresh/access tokens, cookie
  values, API keys);
- personal or sensitive data that the business decides to exclude per role
  scope (no configured exception in v1);
- binary/large content (attachment bytes, hashed artifacts);

The contract's server path is the single judge. The client:

- renders `redacted=true` as the server-provided fixed Arabic placeholder
  ("قيمة محجوبة") plus `redactionReasonAr` when provided;
- never renders `oldValue/newValue` for redacted entries (the API omits them);
- never performs its own redaction heuristics on non-redacted values — that
  would re-create a trust boundary in the browser;
- never queries for raw values via search or filters on redacted fields.

Error payloads, audit summaries, and lifecycle event reasons never contain
raw credentials, attachment contents, or internal stack data — enforced by the
server; the frontend treats any absent redaction flag as authoritative.

## Action vocabulary

Actions are enumerated by the contract and translated centrally in the UI.
The v1 canonical action set is: `Create | Update | Delete | Submit | Post |
Reject | Revise | Cancel | Reverse | Upload | DeleteAttachment | Assign |
Transfer | Return | Dispose | Start | Complete | Close | Login | Logout |
SetActiveScope`. Unknown/unratified action values render as the raw code in a
code-styled element (never as a guessed Arabic label) until the snapshot
documents them.

## Frontend behavior rules

1. **Two queries.** The audit list page uses the header read with server
   pagination (`usePagination` + query params); the detail view uses the
   detail read. No client joins, no cross-entity aggregation in the browser.
2. **No audit derivation.** Audit UI never derives frames from current entity
   data; links go from entity detail to audit records via `entityId` +
   `entityType` (document history `correlationId` maps a lifecycle event to its
   audit record).
3. **Cache discipline.** Audit queries use a short stale time and are
   invalidated after any authenticated mutation that may generate audit
   records (document actions, custody, count, etc.). Redacted responses are
   cached as returned; raw values never enter the cache.
4. **Arabic UI.** Table columns, filters, entry labels, redaction placeholders,
   and empty states are Arabic. Field labels come from `fieldLabelAr`
   (server-provided); unknown fields render the raw code only.
5. **Permission.** The whole module is gated by one permission (`audit.view`,
   `e01-t07`). A user without it never sees the route, entries, or links.
6. **Partial failure.** Header and detail load independently; a failed read
   shows the shared Arabic error state with retry, without hiding the other
   surface.
7. **Accessibility/RTL.** The audit table uses the shared DataTable; the diff
   renders as a semantic two-column list (field label/value) that is readable
   by screen readers with visible focus and logical-direction layout.

## Compatibility and OpenAPI impact

D-AUD-02 requires these increments to the provisional contract:

- `GET /audit-logs`: response items are header-only, no `entries` array
  (smaller payload, cache-friendly); kept `AuditLogPage` envelope.
- `AuditLogEntry`: add `fieldLabelAr` (server-provided Arabic label) and keep
  `redacted`, `redactionReasonAr`; omit `oldValue`/`newValue` entirely when
  redacted (schema-level: nullable strings already, but the decision pins
  semantics: they are absent, not empty).
- Pin the typed `AuditAction` enum above.
- Document that `summaryAr` never contains raw values and that the search
  parameter never applies to redacted fields.
- Confirm the detail-entries cap in the envelope schema (e.g. metadata field) or
  replace with a paged entries endpoint at ratification if unbounded.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e22-t07` | Build the audit services and redacted display mapping: header list query, detail query, Arabic field-label mapping, redaction rendering, correlation links. |
| `e04` (shared) | `SharedTable`/StatusBadge/empty states consumed; no new audit-specific table created. |
| `e12-t12`, document features | Audit correlation links from lifecycle events use only documented `correlationId`/`entityId` pairs. |
| `e01-t07` | Include `audit.view` in the permission/route matrix; audit routes gate on it. |
| `e24-t07`–`e24-t09` | Tests: redaction never leaks, server errors Arabic-safe, pagination from contract, audit on reverse/create flows. |
| `e01.7` | Ratify the typed action enum, paged entries cap or endpoint, and redaction reasons. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Client-side redaction heuristics | Rebuilds a trust boundary in the browser; values would briefly exist in memory/cache. |
| Return full raw diffs and hide via CSS | The data still reaches the client and cache; server redaction is the binding rule. |
| Reconstruct audit history from current state | Loses historical truth and violates D-LIFE-01/§12 separation. |
| Client-controlled pagination of a raw dump | Contract-bound server pagination is mandatory for audit-scale data. |
| Display JSONB `summary` blob raw | Non-redacted shape, non-Arabic exposures; `summaryAr` is the display surface. |
| Unlimited detail entries inline | Unbounded payload introduces caching/paging; bounded by design or dedicated paged endpoint. |

## Explicitly owned remaining decisions

- Concrete field-level sensitive-value allowlist and per-role redaction
  exceptions: backend/security `e01.7` (and release review). The frontend
  behavior is defined for whatever the server returns.
- Audit retention/purge policy: backend decision, not a frontend constant.

Development proceeds on the approved read/redaction model and the provisional
contract; the frontend never guesses a value the server withheld.