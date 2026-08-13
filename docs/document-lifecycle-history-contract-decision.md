# EIAMS Document Lifecycle, Action, and History Contract Decision

**Status:** Approved frontend and provisional API contract decision
**Decision ID:** D-LIFE-01
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01-t04`
**Decision date:** 2026-08-09

## Decision

EIAMS v1 exposes one server-authoritative lifecycle policy and one immutable
lifecycle-event collection for every `WarehouseDocument`. The frontend never
derives history from the current status, draft update timestamps, stock
movements, or `AuditLog`; it renders the ordered events and action availability
returned by the API.

The generic document lifecycle for Receiving, Issue, Transfer, Opening, and
Return is:

```text
Created -> Draft -> Submitted -> Posted -> Reversed
                    |
                    +-> Rejected -> Draft (through explicit Revise)

Draft / Submitted / Rejected -> Cancelled
```

`Cancelled` and `Reversed` are terminal. `Posted` is immutable and may become
`Reversed` only after a compensating document succeeds. Rejection is a durable
state so the rejection decision remains visible and the document cannot be
edited until the keeper explicitly starts a revision.

Adjustment remains the D-ADJ-01 exception. `CountVariance` and
`DirectCorrection` use `Draft -> Posted -> Reversed`; Disposal uses
`Draft -> Posted` and is terminal. Adjustment never exposes Submit, Reject,
Revise, or Cancel actions in v1.

## Problem being solved

The PRD fixes the major states and separation of duties, but it does not pin the
transport shape for rejection-to-draft, cancellation sources, immutable event
history, compensating reversal references, or action availability. The ERD has
no document-lifecycle ledger, and the historical UI timeline includes an
unsupported Approved step. The provisional OpenAPI currently has a generic
optional-reason request, no explicit Revise action, an `Updated` lifecycle event,
and action responses that return no event or compensating-document reference.

Without one decision, feature pages would independently infer transitions and
manufacture timelines, weakening the legal/audit trail of a document-driven
government system.

## Governing evidence

| Source | Governing consequence |
| --- | --- |
| PRD Chapters 7–9 and D-WF-01 | Generic lifecycle is Draft, Submitted, Posted, Reversed, Rejected, and Cancelled. Keeper creates/submits; manager posts/rejects. Cancel is pre-posting only. |
| PRD Chapter 12 | Draft alone is editable; Submitted is locked; posting is transactional; reversal uses a reversing document rather than editing the original. |
| PRD D-MOV-01 and BDM D-BDM-01 | Posted effects and ledgers are immutable; reversal creates compensating, traceable records. |
| D-ADJ-01 | Adjustment is manager-owned `Draft -> Posted -> Reversed`; Disposal is terminal and non-reversible. |
| SAD sections 10–12 | DocumentTimeline consumes immutable contract events, never synthesizes history from status or AuditLog, and must distinguish the adjustment exception. |
| UI/component guidance | Status, timeline, confirmation, reason capture, RTL, accessible feedback, and pending mutation behavior come from shared components. Historical Approved UI text is not a v1 state. |
| D-OAS-01/D-OAS-02 | Lifecycle actions require stable operation IDs, idempotency, optimistic concurrency, policy/preflight responses, and immutable read projections. |
| AGENTS.md | Keepers never see Post, managers do not receive keeper-only Submit, and tests cover lifecycle/permission/error states. |

## Canonical current states

| Policy kind | Current states | Mutable state | Terminal states |
| --- | --- | --- | --- |
| `Generic` | `Draft`, `Submitted`, `Rejected`, `Posted`, `Cancelled`, `Reversed` | `Draft` only | `Cancelled`, `Reversed` |
| `Adjustment` | `Draft`, `Posted`, `Reversed` | `Draft` only | `Reversed` |
| `Disposal` | `Draft`, `Posted` | `Draft` only | `Posted` |

`Approved` is not a document state or lifecycle event in v1. `Updated` is an
audit action, not a lifecycle event. Draft field/line/attachment changes update
the aggregate row version and audit detail but do not create timeline noise.

## Generic transition contract

| Action | From | To | Reason | Required semantic authority |
| --- | --- | --- | --- | --- |
| Create | none | `Draft` | none | User may create the document type in the selected warehouse scope. |
| Submit | `Draft` | `Submitted` | none | Keeper submit authority; draft and policy validation succeed. |
| Reject | `Submitted` | `Rejected` | required | Manager review/reject authority in scope. |
| Revise | `Rejected` | `Draft` | none | Keeper revision authority; this is the only way a rejected document becomes editable. |
| Post | `Submitted` | `Posted` | none | Manager post authority; signed-original and all domain policies succeed. |
| Cancel | `Draft`, `Submitted`, or `Rejected` | `Cancelled` | required | Pre-post cancellation authority for the current state/scope, defined by D-RBAC. |
| Reverse | `Posted` | `Reversed` | required | Reversal authority and domain eligibility; compensating document succeeds atomically. |

The lifecycle contract deliberately does not assign permission-code strings or
decide whether a submitted cancellation belongs to a keeper or manager. The
server returns the outcome through action policy; `eiams-frontend-e01-t07`
owns the exact role/permission matrix.

Every action validates the current `rowVersion`. A stale request returns `409`
with the current status/version/policy and changes nothing. Submit, Post,
Reject, Revise, Cancel, and Reverse accept an `Idempotency-Key`; replay with the
same key and equivalent request returns the original authoritative result.

## Adjustment and disposal transitions

| Policy kind | Action | From | To | Reason/restriction |
| --- | --- | --- | --- | --- |
| `Adjustment` | Create | none | `Draft` | Manager-owned. |
| `Adjustment` | Post | `Draft` | `Posted` | D-ADJ-01 posting policy and signed-original gate apply. |
| `Adjustment` | Reverse | `Posted` | `Reversed` | Required reason; creates a compensating adjustment. |
| `Disposal` | Create | none | `Draft` | Manager-owned disposal purpose. |
| `Disposal` | Post | `Draft` | `Posted` | Terminal asset/ledger/custody transaction. |

All other adjustment/disposal lifecycle actions are unsupported, hidden, and
rejected by the server. A disposal never receives a Reversed event.

## Immutable lifecycle event contract

Every successful lifecycle transition appends exactly one event in the same
transaction as the current-state update. Events are never updated or deleted.
The v1 event types are:

`Created | Submitted | Posted | Rejected | RevisionStarted | Cancelled | Reversed`

Each event exposes:

- stable `eventId` and owning `documentId`;
- `eventType`, optional `fromStatus`, and resulting `toStatus`;
- `occurredAt` as an offset-aware date-time;
- an authorized historical actor snapshot with user identity and display name;
- the resulting document `rowVersion`;
- a display-safe reason when the action requires one;
- optional correlation identity for support/audit navigation; and
- optional related document identity/reference for a reversal or other
  contract-defined compensating result.

The Created event omits `fromStatus` and results in Draft. All later events have
both statuses. Actor labels are returned by the server as historical display
snapshots; the frontend does not join current User/Employee data. Audit-detail
redaction remains D-AUD work in `eiams-frontend-e01-t06`, but raw credentials,
attachment contents, and internal error data never belong in lifecycle reason
or actor fields.

`GET /warehouse-documents/{documentId}/history` returns the complete event
collection ordered by `occurredAt`, then `eventId`, oldest first. A document
timeline is small and bounded by state actions, so v1 does not paginate it.
The response also includes the authoritative current status and row version so
a detail page can detect a stale current-document query. Authorization and
not-found responses are explicit.

## Reversal semantics

Reverse is not a direct balance rollback. The backend creates and posts a
compensating document in one idempotent transaction, appends the required stock,
asset, custody, and audit records, then marks the original document Reversed and
appends its Reversed lifecycle event.

The action result contains:

- the updated original document;
- the appended Reversed lifecycle event; and
- a `relatedDocument` summary identifying the compensating document.

If compensation fails, the original remains Posted and no lifecycle event is
appended. The exact domain eligibility of a posted document is expressed by
policy blockers rather than inferred in the browser. Disposal is never eligible.

## Action policy contract

Every document detail contains a `DocumentPolicy`, also available through the
policy endpoint. It includes policy kind, status, evaluated row version/time,
signed-original result, blockers/advisories, and one entry for every action
relevant to that policy kind.

Each action entry has:

- canonical action type;
- `presentation = Hidden | Disabled | Enabled`;
- `allowed`, consistent with `presentation = Enabled`;
- whether confirmation and a reason are required; and
- machine reason code plus Arabic-safe reason when disabled.

`Hidden` is used when the user lacks permission/scope or the action is not part
of the policy kind; unauthorized actions are not rendered. `Disabled` is used
for an otherwise visible action blocked by state, signed-original verification,
balance/capability, concurrency, active-count, or other business policy.
`Enabled` means the server currently considers the action available, but the
mutation still revalidates all rules.

The frontend must not combine local status switches with permission checks to
override this response. Shared `usePermission` predicates remain a
defence-in-depth visibility gate; both layers must allow the action.

## Action request and response contract

- Submit, Revise, and Post use a version-only request containing `rowVersion`.
- Reject, Cancel, and Reverse use a reasoned request containing `rowVersion` and
  non-empty `reason`.
- All successful generic actions return `DocumentActionResult` containing the
  authoritative document, appended lifecycle event, and optional related
  document.
- Adjustment Post adds its lifecycle event to the existing authoritative effects
  response. Adjustment Reverse returns the updated original adjustment,
  compensating adjustment, and appended lifecycle event.
- Policy/validation failure uses the shared problem envelope. `409` lifecycle
  conflict includes current status, row version, and policy so the UI can refetch
  and explain the conflict without applying an optimistic local transition.

## Frontend presentation rules

1. DocumentTimeline renders actual events only. It never inserts future,
   pending, Approved, or inferred milestones into history. Workflow progress,
   if shown, is a separate policy-driven control.
2. Events render in chronological order using an accessible ordered list.
   Actor, timestamp, resulting status, related-document link, and authorized
   reason are text, not color-only information.
3. StatusBadge maps all generic and adjustment statuses centrally. Rejected,
   Cancelled, and Reversed never fall back to a success treatment.
4. The action bar renders only server-returned visible actions and uses shared
   confirmation/reason dialogs. While a mutation is pending, consequential
   actions are disabled to prevent duplicates.
5. After success, install or refetch the authoritative document/policy/history
   and invalidate affected balance, asset, custody, movement, and report queries.
   Never append a guessed event optimistically.
6. On `409`, discard optimistic UI state, refetch detail/policy/history, and show
   the Arabic-safe conflict message. On `403`, preserve the document view but
   remove unavailable actions after refetch.
7. Timeline and action controls are RTL-first, keyboard accessible, expose
   visible focus, and honor reduced motion; pulse animation is decorative only.

## Compatibility and OpenAPI impact

D-LIFE-01 requires a provisional contract version increment and these changes:

- add the explicit Revise operation;
- replace the generic optional-reason action body with version-only and
  reason-required request schemas;
- replace `Updated` lifecycle event with `RevisionStarted`;
- expand lifecycle events with actor snapshot, document version, correlation,
  and related-document reference;
- return a lifecycle-history envelope with current status/version;
- return `DocumentActionResult` from generic actions;
- add policy kind and Hidden/Disabled/Enabled presentation semantics;
- add lifecycle conflict details and explicit auth/not-found responses; and
- include lifecycle events in adjustment Post/Reverse results.

Backend ratification remains `eiams-frontend-e01.7`. Persistence may use a
dedicated append-only table or an equivalent transactional backend mechanism,
but the immutable API behavior and stable event identity are mandatory. The
frontend never reads persistence tables directly.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t07` | Assign exact permission/scope rules to the semantic actions without altering this state machine. |
| `e01-t05` | Supply signed-original verification states/blockers consumed by Post policy. |
| `e01-t06` | Keep detailed audit/redaction separate from lifecycle events while preserving correlation navigation. |
| `e04-t14` | Render the immutable actual-event collection as an accessible RTL timeline. |
| `e04-t15` | Render policy presentation/reason/confirmation semantics without local transition inference. |
| `e12-t01`, `e12-t08`–`e12-t12` | Consume generated lifecycle/history/action contracts, invalidate authoritative queries, and coordinate all policy gates. |
| `e13`–`e19` document features | Use the generic policy unless an approved exception applies; never duplicate lifecycle logic. |
| `e21-t01`–`e21-t09` | Use the adjustment/disposal policy and action results from D-ADJ-01 plus D-LIFE-01. |
| `e22-t07`, `e23`, `e24-t07`–`e24-t09` | Preserve audit/report correlation and test immutable, idempotent, concurrent lifecycle behavior. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Treat Reject as an immediate invisible return to Draft | Loses a durable review outcome and permits editing without an explicit revision boundary. |
| Let a rejected document become editable automatically | Makes the transition and row-version change invisible and encourages client-side state mutation. |
| Derive timeline entries from current status, `updatedAt`, or AuditLog | Cannot reconstruct repeated reject/revise cycles reliably and violates the SAD separation between lifecycle and audit detail. |
| Include every draft edit as a lifecycle event | Produces noisy timelines and duplicates the field-level audit contract. |
| Show pending or Approved entries inside immutable history | Presents events that never occurred and introduces an unsupported v1 state. |
| Return one optional `reason` request for every action | Does not express which actions require legal/business rationale and weakens generated validation. |
| Mark the original Reversed before compensation succeeds | Breaks transactional integrity and can leave status inconsistent with immutable ledgers. |
| Reuse generic Submit/Reject/Cancel for Adjustment or Disposal | Contradicts D-ADJ-01 and exposes invalid actions. |
| Optimistically append timeline events in the browser | Can display a legal/audit event the server rejected or rolled back. |

## Explicitly owned remaining decisions

- Exact action permission codes and role/scope ownership: `e01-t07`.
- Signed-original verification states, authority, and failure payload:
  `e01-t05`.
- Audit-detail field projection and redaction: `e01-t06`.
- Backend persistence, event retention, and production compatibility:
  `e01.7` ratification.

These gaps do not authorize frontend guesses. Development consumes the
provisional D-LIFE-01 schemas; production waits for the existing ratification
and release gates.
