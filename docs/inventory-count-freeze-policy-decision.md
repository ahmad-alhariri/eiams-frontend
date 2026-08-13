# Inventory-Count Freeze Policy Contract Decision

**Status:** Approved for EIAMS v1 frontend and OpenAPI planning  
**Beads:** `eiams-frontend-e01.2`  
**Decision date:** 2026-08-09

## Decision

EIAMS v1 supports exactly one inventory-count freeze policy:

`SoftFreeze`

`HardFreeze` and `NoFreeze` are deferred to v2. The broader enum listed in
PRD sections 6.5 and 10.4 is the product vocabulary, not authorization to
expose every future option in the v1 UI/API. The explicit v1 scope in the
Architecture Overview and ERD, together with PRD section 12.6 calling
SoftFreeze the recommended v1 behavior, selects the safe supported subset.

`SoftFreeze` is advisory only. While a count is `InProgress`, it warns users
about an operational document action that overlaps the active count; it never
blocks create, edit, submit, post, reversal, balance display, or a permitted
count workflow action. Negative-stock, warehouse-capability, signed-original,
and document-lifecycle policies remain independently enforced and must not be
relaxed because a count is active.

## V1 policy and count lifecycle

| Count state | SoftFreeze effect | UI behavior |
| --- | --- | --- |
| `Planned` | None | Do not show a freeze warning. |
| `InProgress` | Advisory warning for an overlapping non-count operation | Render the contract-provided warning; let the authorized action continue. |
| `Completed` or `Closed` | None | Remove the active-count warning after the authoritative refetch. |

The server remains responsible for enforcing the existing invariant that only
one count for a warehouse can be `InProgress`. Count planning, starting,
completion, closure, and count-entry permissions are unchanged: Warehouse
Managers own plan/start/complete/close; Warehouse Keepers enter actual count
quantities. A SoftFreeze warning grants no permission and cannot override a
permission or scope denial.

## Overlap and warning semantics

The backend determines overlap from the authoritative count warehouse and
scope, plus the operation's warehouse and affected material/asset when known.
The frontend must not reconstruct scope membership from cached catalog data or
infer that every warehouse action overlaps every count.

- A warning applies only while the matching count is `InProgress`.
- A document action in another warehouse receives no warning from the count.
- A document action in the counted warehouse receives a warning only when the
  server determines that its material/asset is within the active count scope.
- When an operation has no resolvable material/asset yet, the server may return
  a warehouse-level provisional warning. The UI replaces it with the
  authoritative scoped result as lines are selected or the action preflight is
  refreshed.
- Count-entry and count-lifecycle actions for the same session do not generate
  a self-warning.
- The warning is informational: there is no required acknowledgement, no
  client-side persisted acknowledgement, and no audit event solely for viewing
  or dismissing the notice. The underlying posted document/audit history is
  sufficient traceability.

At a minimum, the shared operational policy surface displays a visible Arabic
warning in the document context and repeats it in the final action confirmation
when the server reports it still applies. It must be keyboard-accessible and
must not disable the action control. If an in-flight action returns a newer
policy response, the UI displays that authoritative response rather than using
a stale local warning.

## API and generated-type contract

Exact paths and generated client code are owned by `eiams-frontend-e01-t02`.
The versioned v1 contract must nevertheless provide these semantics:

### Inventory count create/read/update

- `freezePolicy` is required and has the single accepted v1 value
  `SoftFreeze`.
- Create/count-detail/list responses return `freezePolicy: SoftFreeze`; the
  client has no option selector or fallback default for `HardFreeze` or
  `NoFreeze`.
- A request containing `HardFreeze` or `NoFreeze` is rejected as an unsupported
  v1 policy. The frontend surfaces the server's Arabic validation error.
- Count state, warehouse context, scope definition, `rowVersion`, and the
  server-owned single-active-count conflict are exposed so forms can render
  authoritative loading, conflict, and read-only states.

### Operational policy/preflight response

Any affected document form/action preflight exposes a reusable,
server-computed collection of operational advisories. Each advisory contains
at least:

- stable `code` (`ActiveSoftFreeze` for this decision) and `severity`
  (`Warning`);
- `countId`, count display reference when available, `warehouseId`, and current
  count status;
- a server-computed overlap state and optional affected-scope summary; and
- an Arabic display message or a contract-approved message key with its display
  parameters.

The same advisory shape is used by the shared document policy coordinator and
feature pages. It is returned/refreshed when warehouse or lines change and at
the action boundary. It is advisory data, not an action-blocker list. Server
responses still return normal permission, validation, concurrency, capability,
balance, signed-original, and lifecycle failures independently.

## Frontend implementation guardrails

- The count planning form sends/displays the generated `SoftFreeze` value but
  provides no freeze-policy selector, hidden feature flag, or disabled future
  choices.
- The active-count warning is a reusable shared policy presentation, not a
  copy-pasted banner in receiving, issue, transfer, return, opening, or
  adjustment modules.
- Store advisory/policy responses in TanStack Query with the operation form;
  do not duplicate active-count or scope state in Zustand and do not retain a
  derived warning after the response changes.
- Invalidate/refetch active-count and policy data after start, completion, and
  closure. The warning disappears only from a fresh authoritative response.
- Preserve normal RTL, Arabic, accessible alert/confirmation, loading, error,
  empty, and optimistic-concurrency behavior. A warning must not obscure a
  blocking error from another policy.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Offer all PRD enum values in v1 | Exposes two explicitly deferred operational modes without contracts, test coverage, or safe enforcement semantics. |
| Implement `HardFreeze` only in the frontend by disabling Post | A browser-only block is bypassable, conflicts with server authority, and could leave documents in inconsistent states. |
| Offer `NoFreeze` as an escape hatch | Lets users remove a documented control without an approved v1 authorization/audit model. |
| Warn for every operation in a warehouse regardless of count scope | Creates false alarms and requires the client to invent overlap rules. |
| Require a warning acknowledgement or record a separate audit event | Adds a business approval/audit rule not present in the governing sources. |
| Let each feature call a bespoke active-count endpoint and render its own alert | Duplicates policy logic and produces inconsistent wording, timing, and accessibility. |

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t02` | Pin the single-value v1 enum, invalid future-value response, count state/scope fields, and reusable advisory contract in OpenAPI. |
| `e12-t12` | Expose `ActiveSoftFreeze` through the shared document policy coordinator without treating it as a blocker. |
| `e20-t01`, `e20-t03`, `e20-t05` | Model the fixed policy, planning behavior, active-count lifecycle, and authoritative refetches. |
| `e20-t09` | Render and refresh the shared active-count operational warning. |
| `e20-t10`, `e20-t11` | Apply the same semantics to asset verification and verification coverage. |
| Document modules downstream of `e12-t12` | Consume the shared advisory at relevant document form/action boundaries; do not create local policy variants. |
| `e21-t01`, `e21-t09`, `e23-t08`, `e24-t05` | Respect count-state warnings and use server-authoritative count data through adjustment, reporting, and end-to-end verification. |

## Consequences

Historical ERD/schema values that expose `NoFreeze`, as well as the broad PRD
enum, do not authorize their v1 presentation or use. The OpenAPI service must
publish the v1 subset and advisory response before inventory-count or document
feature work begins. A later HardFreeze/NoFreeze release requires a separate
product decision covering permissions, posting enforcement, exception handling,
audit behavior, migration, and tests.
