# Adjustment and Disposal Workflow Contract Decision

**Status:** Approved for EIAMS v1 frontend and OpenAPI planning  
**Beads:** `eiams-frontend-e01.3`  
**Decision date:** 2026-08-09

## Decision

Adjustment is a manager-owned exception to the generic WarehouseDocument
workflow. This includes an adjustment whose business purpose is disposal.
The only adjustment lifecycle is:

`Draft -> Posted -> Reversed`

There is no `Submitted`, `Approved`, `Rejected`, or `Cancelled` adjustment
state in v1. The generic Keeper Submit / Manager Post action bar must not be
composed for this module. A Warehouse Manager within the relevant warehouse
scope creates, edits, posts, and—where permitted—reverses an adjustment.

This resolves the contradictory keeper-create/submit disposal prose in PRD
section 12.10 in favor of PRD D-ADJ-01, PRD section 12.7, and SAD section 10.
It preserves one authorization and lifecycle model for all adjustments and
does not create an undocumented disposal-only workflow.

## Adjustment purposes and required fields

`InventoryAdjustment.adjustmentPurpose` is required and has one of these v1
values:

| Purpose | `countId` | Lines | Required rationale | Reversal policy |
| --- | --- | --- | --- | --- |
| `CountVariance` | Required | One or more variance-derived lines | Reason on every changed line; count context is retained | Allowed through a compensating adjustment. |
| `DirectCorrection` | Forbidden | One or more signed stock-difference lines | Header justification and a reason on every line | Allowed through a compensating adjustment. |
| `Disposal` | Forbidden | Exactly one asset-backed line | Disposal reason and the signed disposal authorization | Not supported in v1; the action is terminal. |

The existing `InventoryAdjustment.reason` remains the documented header
rationale. `AdjustmentLine.reason` remains required for every non-zero line.
The versioned contract must add nullable `AdjustmentLine.assetId` rather than
place an asset reference only on an adjustment header. That keeps adjustment
lines traceable, permits a material/asset integrity check, and leaves a safe
extension point for a future, separately approved asset correction workflow.

For a `Disposal` adjustment, the server validates all of the following before
posting:

- exactly one line exists, with its `assetId` required;
- the selected asset is not already `Disposed` and is otherwise eligible for
  disposal under server-authoritative state and scope rules;
- the line `materialId` matches the asset's material;
- the line effect is exactly `-1`, expressed as the canonical signed
  adjustment quantity; and
- the document has no `countId` and no mixed disposal or ordinary adjustment
  lines.

For `CountVariance`, an asset reference is permitted only when it comes from a
server-provided asset count line; the line must match that count line's
material and variance. For `DirectCorrection`, `assetId` is not supported in
v1. A future asset correction requires its own workflow/event decision; it
must not be represented as an ambiguous direct stock adjustment.

## Authorization and UI policy

The permission-code names remain an OpenAPI/RBAC contract concern, but the
semantic policy is fixed:

| Action | Eligible role and scope | UI behavior |
| --- | --- | --- |
| Create or edit Draft adjustment/disposal | Warehouse Manager with the document warehouse in scope | Show Create, Edit, line controls, and attachment controls only to an eligible manager. |
| Post a Draft adjustment/disposal | Warehouse Manager with posting scope | Show Post only after policy validation succeeds. |
| Reverse a posted ordinary adjustment | Warehouse Manager with reversal scope | Show the dedicated reversal action only for `CountVariance` or `DirectCorrection`. |
| Reverse a posted disposal | Nobody in v1 | Do not render a reversal action; the server rejects the request. |
| Create, submit, or edit adjustment/disposal as Warehouse Keeper | Nobody in v1 | Do not render these actions or a generic Submit action. |

The frontend must use generated permission/scope data and the shared policy
coordinator. It may hide unavailable actions, but the server is authoritative
for every mutation and state transition. This decision does not introduce
client-side authorization or an approval bypass.

## Signed original and posting gate

Every adjustment purpose requires a `SignedOriginal` attachment before Post.
For disposal, that attachment is the disposal authorization. The UI disables
Post while the server reports the signed-original prerequisite is unmet and
renders the server-provided Arabic failure reason. Attachment verification
authority, states, and endpoints are intentionally owned by
`eiams-frontend-e01-t05`; this decision establishes only that a valid signed
original is a hard posting prerequisite.

Posting also requires Draft status, a permitted manager/scope, valid optimistic
concurrency version, complete reasons, and purpose-specific validation. The
frontend must not locally infer an available balance, asset status, attachment
verification, or posting success from stale form data.

## Posting, immutable history, and reversals

Posting is a single backend transaction. It changes no balance or derived
asset status directly from the browser and appends immutable records only.

| Posted operation | Required effects |
| --- | --- |
| CountVariance or DirectCorrection | Append `AdjustmentIn` for a positive signed line and `AdjustmentOut` for a negative signed line; update the cached inventory balance transactionally; append audit and document lifecycle history. |
| Disposal of an asset currently in warehouse stock | Append one `AdjustmentOut` with quantity `-1`; append the canonical `Disposed` asset event; close active custody if one exists; derive terminal `Disposed` status; append audit and lifecycle history. |
| Disposal of an issued/custodied asset | Append no further StockMovement because Issue already removed it from stock; close active custody if one exists; append `Disposed`; derive terminal `Disposed` status; append audit and lifecycle history. |

The detailed canonical event vocabulary and custody ordering are defined in
`docs/return-asset-movement-event-contract-decision.md`. The frontend consumes
server-provided movement/history records and derived asset status; it never
manufactures a movement, modifies a ledger, or calculates a disposal state.

An ordinary reversal creates a new compensating adjustment document and
appends compensating ledger/audit/history entries. It never mutates or deletes
the posted adjustment, its stock movements, or its audit records. The original
adjustment becomes `Reversed` only after that compensating operation succeeds.
Disposal has no automatic or manual reversal in v1 because `Disposed` is a
terminal legal/business state. Any restoration or correction after disposal
requires a future approved product and event contract.

## API and read-model contract

The generated OpenAPI surface must expose, at minimum, the following semantic
fields. Exact endpoint paths and transport envelopes remain owned by
`eiams-frontend-e01-t02`.

### Draft create/update request

- `adjustmentId` when updating, `documentId`, `warehouseId`, `rowVersion`
- `adjustmentPurpose`, `countId` when required, and header `reason`
- lines with `adjustmentLineId` when updating, `materialId`, signed
  `quantityDelta`/`difference`, per-line `reason`, and optional `assetId`
- attachment references are managed through the shared document attachment
  contract, not copied into a local upload payload

### Actions

- A Post action accepts document identity and concurrency version, returns the
  authoritative posted document, adjustment state, lifecycle history, and
  policy failure envelope when unsuccessful.
- An ordinary Reversal action accepts document identity, reversal rationale,
  and concurrency version; it returns the compensating document and updated
  authoritative states.
- A disposal Post response includes the selected asset's derived status and
  immutable event/movement references needed by detail/history views. It does
  not expose a disposal-reversal action.

### Read models

List and detail projections must include the adjustment purpose, document and
adjustment states, warehouse context, count reference where applicable,
reasons, signed-original policy state, authorization/action availability,
lines, and immutable movement/audit/lifecycle references. Disposal details
also include `assetId`, server display identity, derived asset status, and any
custody closure reference. Historical displays retain these references even if
catalog, employee, or external-party records later become inactive.

## Frontend implementation guardrails

- Model adjustment purpose and lifecycle from generated contract enums; do not
  reuse generic document status controls or legacy ERD/schema enums.
- Use the shared document attachment/policy infrastructure, but supply the
  adjustment-specific manager lifecycle policy rather than duplicating its
  action bar.
- Keep Draft forms in React Hook Form plus Zod once generated schemas are
  available. Disposal selection must use an authoritative eligible-asset
  lookup; never permit free-text asset identities.
- Keep server data in TanStack Query and invalidate/refetch balances, document
  detail, asset status/history, custody state, and movement ledgers after a
  successful mutation. Never store any of them in Zustand.
- Render Arabic server messages and available actions with RTL shared UI;
  include loading, empty, concurrency, permission, attachment, and terminal
  disposal states.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Let a Warehouse Keeper create and submit disposal while managers own other adjustments | Contradicts the governing manager-owned adjustment exception and creates two incompatible action policies for the same document type. |
| Send disposal through generic `Draft -> Submitted -> Posted` lifecycle | Defeats the explicit adjustment exception and makes history/RBAC behavior inconsistent. |
| Store only a header-level disposal asset reference | Loses line-level provenance and prevents a robust material-to-asset validation contract. |
| Allow multiple assets or ordinary lines in one disposal adjustment | Makes terminal asset action and stock effects ambiguous; a single asset disposition must be individually auditable. |
| Treat disposal as a reversible generic stock adjustment | Violates the PRD terminal-state rule and could silently restore a legally disposed asset. |
| Let the frontend close custody, decrement stock, or emit events | Violates the document-driven, append-only backend transaction model and risks duplicate movements. |

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t02` | Pin `adjustmentPurpose`, nullable line `assetId`, lifecycle/action payloads, policy failures, read models, and terminal-disposal behavior in OpenAPI. |
| `e01-t05` | Define the signed-original verification state consumed by the adjustment Post gate. |
| `e12-t12` | Make the shared policy coordinator support the manager-owned adjustment exception without generic Submit. |
| `e20-t08`, `e20-t11` | Expose count completion/variance data suitable for a `CountVariance` adjustment launch and verification. |
| `e21-t01` through `e21-t09` | Implement adjustment/disposal services, forms, posting, detail, terminal behavior, and verification against this contract. |
| `e18-t05`, `e19-t01`, `e19-t09` | Consume server-derived asset history/status and custody closure semantics. |
| `e23-t08`, `e23-t09`, `e24-t05` | Report and verify canonical adjustment, disposal, movement, and audit chains. |

## Consequences

The historical ERD/schema adjustment `Submitted`/`Approved` states and generic
`Increase`/`Decrease` vocabulary are not frontend contract inputs. The OpenAPI
and backend schema must expose this decision's purpose, asset-line reference,
and policy/read-model semantics before feature implementation begins. This
decision does not resolve attachment-verification mechanics or publish endpoint
names; those remain deliberately blocked by their owning Beads.
