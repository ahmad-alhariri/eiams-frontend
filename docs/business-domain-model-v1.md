# EIAMS Business Domain Model — V1 Planning Baseline

**Status:** Approved canonical BDM for EIAMS v1 frontend and OpenAPI planning  
**Version:** 1.2.0
**Owner:** EIAMS Architecture and Contract Decisions workstream  
**Beads:** `eiams-frontend-e01.1`  
**Decision date:** 2026-08-09

## Purpose, authority, and change control

This is the first versioned Business Domain Model (BDM) available in the
repository. It replaces the unavailable BDM v1.0 cited by the ERD as the
canonical domain-model reference for EIAMS v1 planning. It is a traceable
consolidation of documented business concepts; it does not silently create a
new product rule or substitute an API schema.

Authority applies in this order:

1. The current Beads task and approved decision artifacts it references.
2. PRD chapters 9 and 10 where the PRD marks them governing for ambiguity.
3. This BDM as the canonical domain-model consolidation.
4. SAD for frontend architecture, then ERD/schema as historical data-design
   evidence when consistent with the preceding sources.

Any domain change requires a Beads decision, an update to this BDM's version
and provenance table, and a corresponding PRD/OpenAPI update. The frontend
must not treat a field, enum, relationship, or workflow absent from this BDM
and the generated contract as implied. The BDM owner must identify a product
and backend contract reviewer before a version that changes business semantics
is ratified; this planning baseline makes no claim to replace that governance.

## Source provenance

| Source | Version / status | Contribution to this BDM | Use limitation |
| --- | --- | --- | --- |
| `docs/PRD.md` | PRD 2.0 | Primary product concepts, v1 scope, business rules, settled decisions, and schema intent. | Older prose that conflicts with PRD chapters 9–10 or an approved Beads decision is not authoritative. |
| `docs/SAD.md` | Repository SAD | Frontend boundaries and architecture. | Does not define backend domain semantics independently. |
| `docs/ERD.md` | ERD 4.1 | Relationship and persistence evidence. | Cites a missing BDM v1.0 and contains known historical statuses/enums. |
| `docs/schema.md` | Repository schema reference | Supporting table/field evidence. | May be older than PRD v5 and is not an API contract. |
| `docs/Architecture_Overview.md` | Repository architecture overview | Explicit v1 scope constraints. | Technology/implementation context is not a replacement BDM. |
| `docs/requirements-conflict-matrix.md` | Approved planning baseline | Source precedence and recorded conflicts. | Must be updated when a listed conflict is resolved. |
| D-POST-01 | `polymorphic-counterpart-lookup-contract-decision.md` | Counterpart identity, ExternalParty, active validation, and custody mapping. | Exact endpoint/type names remain OpenAPI work. |
| D-RAE-01 | `return-asset-movement-event-contract-decision.md` | Canonical stock/asset events and derived-status consequences. | Persistence constraints and endpoint paths remain OpenAPI work. |
| D-ADJ-01 | `adjustment-workflow-decision.md` | Adjustment/disposal purposes, manager-owned lifecycle, asset line, and terminal behavior. | Attachment verification is owned separately. |
| D-ICF-01 | `inventory-count-freeze-policy-decision.md` | V1 SoftFreeze subset and non-blocking advisory contract. | HardFreeze/NoFreeze remain v2 decisions. |
| D-AUTH-01 | `authentication-session-scope-contract-decision.md` | Authentication token boundary, authoritative session projection, active-scope semantics, and effective role/permission calculation. | Exact permission-code vocabulary remains D-RBAC work; production security parameters require backend ratification. |
| D-LIFE-01 | `document-lifecycle-history-contract-decision.md` | Generic and adjustment/disposal transitions, immutable lifecycle events, server-owned action policy, reason/version request boundaries, and compensating reversal semantics. | Exact permission ownership, attachment verification, audit-detail redaction, and backend persistence remain separately owned. |
| D-MAT-01 | `material-classification-and-custody-decision.md` | Material classification, tracking, distinct asset/serial identity, and Durable-custody extension. | Exact payload and persistence shape remain OpenAPI/backend work. |
| D-UOM-01 | `material-unit-conversion-contract-decision.md` | Material-owned base units, per-material alternate-unit factors, immutable posted-line snapshots, and change control for packaging changes. | Generated endpoint/type names and backend ratification remain provisional. |

The ERD reference to “BDM v1.0” is therefore satisfied by this repository
artifact, version 1.1.0, rather than by an unverified external document.

## Domain map

The following bounded concepts are authoritative for frontend planning. The
table names are implementation evidence only; clients consume generated API
types and read models rather than database tables.

| Domain | Authoritative entities / value concepts | Core relationships and ownership |
| --- | --- | --- |
| Identity and authorization | `User`, `Role`, `Permission`, `RolePermission`, `UserRoleScope` | A User receives roles through scoped assignments. Scope is `Enterprise`, `Site`, or `Warehouse`; permission/scope enforcement is server-authoritative. An Employee and a User are distinct concepts, though a user may link to an employee. |
| Organization and counterparties | Organization, `Site`, `OrganizationalUnit`, `Employee`, `ExternalParty` | Sites belong to the organization; organizational units form a tree; employees belong to organizational structure. `ExternalParty` is the approved active/inactive reference entity for the PRD `External` counterpart type. |
| Catalog | `MaterialDomain`, `MaterialCategory`, `MaterialFamily`, `Material`, `UnitOfMeasure` | Domain → category tree → mandatory family → material. Material has authoritative kind/tracking properties. Category/domain are derived through the hierarchy; clients do not duplicate hierarchy-derived values. |
| Warehouse and availability | `Warehouse`, `WarehouseCapability`, `WarehouseCapabilityOperation`, `WarehouseMaterialSetting` | A warehouse is the only balance holder. Capability authorizes a warehouse to handle material domains for named operations; settings hold operational thresholds, not a second balance. |
| Operational documents | `WarehouseDocument`, `DocumentLine`, `DocumentAttachment`, document sequence/reference, `ReceivingInfo`, `IssueTo`, `TransferInfo` | WarehouseDocument is the document spine. Lines and attachments belong to it; the named petals supply type-specific data. Document types are Receiving, Issue, Transfer, Adjustment, Opening, and Return. A document is the provenance of every stock movement. |
| Inventory and ledger | `InventoryBalance`, `StockMovement` | Balance is the cached signed sum of immutable movements for one warehouse/material. StockMovement belongs to a posted document and source line. No UI or service directly edits balance. |
| Counts and adjustments | `InventoryCount`, `InventoryCountLine`, `InventoryAdjustment`, `AdjustmentLine` | A count belongs to a warehouse and has scoped snapshot/actual lines. Adjustment is document-backed, may reference a count, and has purpose-specific lines. Disposal is a special single asset-backed adjustment, not an independent undocumented asset action. |
| Assets and custody | `Asset`, `AssetMovementHistory`, `Custody`, `CustodyHistory` | Asset belongs only to an Asset material and has immutable lifecycle events. The provisional D-MAT-01 Custody contract adds Durable MaterialQuantity/TrackedUnit subjects without making them Asset records; backend ratification remains required. Asset status and holder remain server-derived. |
| Audit | `AuditLog`, `AuditLogEntry` | Audit records preserve who/what/when for business operations. They are not reconstructed in the frontend from current document state. |

`MaterialUnitConversion` is a Catalog relationship owned by a Material. It
records that Material's alternate unit and its direct factor to the Material's
base unit; it is not a global UnitOfMeasure conversion concept.

Supplier is a free/reference field on receiving in v1, not a Supplier domain
entity. Storage locations, maintenance, two-phase transfer, reserved/available
balances, and asset transfer are not v1 domain concepts.

## Canonical relationships and invariants

### Document-driven inventory

- A stock movement originates from a posted WarehouseDocument and its line.
  No direct balance adjustment exists in the user interface.
- `StockMovement` and audit/history ledgers are append-only. Reversal creates
  compensating, traceable operations rather than editing historical rows.
- `InventoryBalance.quantity` is a backend-maintained cache of signed movement
  effects. The frontend renders it as authoritative only after server refresh.
- Posting requires the relevant warehouse capability, authorization/scope,
  lifecycle state, optimistic concurrency, and a valid signed-original gate.
  Attachment-verification mechanics remain D-DOC work, not a browser rule.

### Documents, roles, and operations

- D-LIFE-01 defines the generic lifecycle as
  `Draft -> Submitted -> Posted -> Reversed`, with durable
  `Submitted -> Rejected -> Draft` through an explicit Revise action and
  cancellation only from Draft, Submitted, or Rejected. Keepers create/submit
  and managers post in the generic model; exact cancellation/reversal permission
  ownership remains D-RBAC work.
- Lifecycle history is an immutable, server-provided collection of actual
  transition events. Draft edits belong to audit detail, not the lifecycle
  timeline, and the frontend never inserts future, pending, or Approved events.
- Adjustment is the deliberate exception: it is manager-owned
  `Draft -> Posted -> Reversed` and must not use generic Submit behavior.
- Receiving adds stock; Issue removes stock and is blocked for insufficient
  balance; Transfer creates atomic source/destination movements; Opening adds
  initial/correction balances; Return uses canonical Receipt semantics; Count
  never changes balance directly; Adjustment appends signed correction events.
- Signed original and supporting attachment are distinct. A frontend displays
  server-provided validity/policy and cannot infer it from a filename or upload
  state.

### Authentication, session, and scope

- User is the authentication subject and remains separate from Employee.
- The authoritative session supplies available scopes, selected active scope,
  effective roles, and effective permission codes; the client never recreates
  the RBAC engine from role assignments.
- Enterprise scope has no entity UUID. Site and Warehouse scopes use their
  entity UUIDs, and permissions accumulate only from assignments covering the
  selected hierarchy as defined by D-AUTH-01.
- Access tokens are memory-only and refresh credentials are browser-managed
  HttpOnly cookies. Token material is never domain/UI state.

### Material classification and accountability

- `Consumable` is Quantity-only with no asset number and no custody.
  `Durable` is Quantity or Serial with mandatory custody and no asset number.
  `Asset` is Serial-only with mandatory custody and asset-registry entry.
- An enterprise asset number is required and unique for every Asset. A
  manufacturer serial is optional for an Asset and may identify a Durable;
  serial number never means asset number or accounting capitalization.
- Kind/tracking may change only before the first posted movement, with
  confirmation and audit evidence. They are immutable afterwards. Legacy
  violations remain readable and require explicit server-owned remediation.
- Historical Custody persistence represents Asset subjects. D-MAT-01's
  provisional OpenAPI adds `MaterialQuantity` and `TrackedUnit` subjects for
  Durable custody, including partial assignment and return; backend/API-owner
  ratification remains required and frontend code must not emulate server work.

### Material units and conversion

- Every Material owns exactly one base unit. It is the canonical unit for
  balances, stock movements, and the base quantity recorded on a document line;
  it is not inherited from a MaterialFamily or warehouse.
- `UnitOfMeasure` is reusable vocabulary, not a global conversion table. A
  `MaterialUnitConversion` makes an alternate unit meaningful for one Material
  and converts directly to that Material's base unit only.
- `factor` is a positive `DECIMAL(18,6)` count of base units in one alternate
  unit. Thus a pen Carton may equal 12 Pieces while an ink Carton equals six
  Boxes. A Material whose base unit is Carton needs no conversion.
- The base unit cannot convert to itself, and there is at most one active
  conversion for `(materialId, fromUnitId)`. Server-side authorization, scope,
  active-reference, factor, duplicate, and optimistic-concurrency validation
  are authoritative.
- A converted posted DocumentLine retains its conversion identity, factor, and
  resulting base quantity. A used conversion is archived/deactivated and
  replaced for a packaging change; it is never deleted or overwritten, and
  historical quantities are never recalculated.

### Asset, custody, and counterpart identity

- Asset status is derived from authoritative custody and asset movement history:
  `InStock`, `Issued`, `InCustody`, or `Disposed`. The frontend never computes
  it from a partial cache.
- Asset event vocabulary is `Received`, `Issued`, `Returned`, and `Disposed`.
  `Disposed` is terminal in v1; it preserves the record/history and has no
  automatic reversal.
- Issue and custody assignment are separate. Operational custody is for an
  OrganizationalUnit, Site, or ExternalParty; Personal custody is Employee
  only. The counterpart lookup contract validates active references on write
  while preserving historical resolution.
- An issued/custodied asset disposal closes active custody and emits Disposed;
  only disposal of in-stock assets produces the corresponding AdjustmentOut
  stock movement.

### Counts and adjustments

- Count lifecycle is `Planned -> InProgress -> Completed -> Closed`; only one
  count per warehouse can be in progress.
- `SoftFreeze` is the only v1 freeze policy. It exposes a server-computed,
  non-blocking warning for an operational action overlapping an in-progress
  count. It never bypasses or replaces another policy.
- A `CountVariance` adjustment references a count; a `DirectCorrection` has
  explicit justification; a `Disposal` has exactly one asset-backed line and
  is terminal. All require documented reasons and a signed-original Post gate.

## Canonical v1 enumerations

The BDM fixes meaning, while `e01-t02` pins exact generated names and transport
types. Unsupported historical values must not appear as selectable v1 UI.

| Concept | V1 values / interpretation |
| --- | --- |
| Document type | `Receiving`, `Issue`, `Transfer`, `Adjustment`, `Opening`, `Return` |
| Stock movement | `Receipt`, `Issue`, `TransferIn`, `TransferOut`, `AdjustmentIn`, `AdjustmentOut`, `Opening` |
| Asset movement | `Received`, `Issued`, `Returned`, `Disposed` |
| Asset derived status | `InStock`, `Issued`, `InCustody`, `Disposed` |
| Count state | `Planned`, `InProgress`, `Completed`, `Closed` |
| Count freeze policy | `SoftFreeze` only; `HardFreeze` and `NoFreeze` deferred to v2 |
| Adjustment purpose | `CountVariance`, `DirectCorrection`, `Disposal` |
| Adjustment state | `Draft`, `Posted`, `Reversed` |
| Counterpart type | `Employee`, `OrganizationalUnit`, `Site`, `External` (resolved to `ExternalParty`) |
| Custody kind | `Operational`, `Personal` |
| Material kind and tracking | Consumable/Quantity only; Durable/Quantity or Serial; Asset/Serial only |
| Attachment type | `SignedOriginal`, `Supporting` |

## Contract gaps and deliberately excluded assumptions

The BDM is not a waiver for unresolved domain/API behavior. The frontend must
stop at the relevant Beads decision instead of guessing in these areas:

| Gap | Owner / required resolution |
| --- | --- |
| Signed-original verification state, authority, exception, and failure payload | `e01-t05` |
| Lifecycle-event persistence and production compatibility with the approved D-LIFE-01 API behavior | `e01.7` backend/API-owner ratification |
| Audit-detail projection and immutable display contract | `e01-t06` |
| Backend-ratified endpoint paths, pagination, errors, uploads, generated types, and response envelopes | D-OAS-02 pins the provisional surface in `contracts/openapi/eiams-v1.openapi.json`; backend/API-owner ratification remains required before production integration. |
| Exact permission-code vocabulary and RBAC mapping | `e01-t07` |
| Document context not modeled by the sources, including Return-to-original-Issue traceability | D-OAS-02 provisionally pins `originalIssueDocumentId` and its read-only reference; backend ratification may change it only through a versioned contract update. |
| Durable custody backend implementation and partial-return ratification | D-MAT-01 is published in provisional OpenAPI as `MaterialQuantity` and `TrackedUnit`; backend/API-owner ratification is required before production custody implementation. |
| Material-unit conversion endpoint, payload, row-version, and posting-snapshot ratification | D-UOM-01 defines the accepted policy. The provisional API must publish the generated conversion surface and backend/API-owner ratification is required before production integration. |

## Required source and OpenAPI alignment

This BDM is effective immediately for planning. The following source changes
must be made by their owning product/backend/OpenAPI work; they are not
frontend code changes.

### PRD / documentation errata

- Add this BDM's repository path, version, owner, and provenance to the PRD
  and replace the ERD's unavailable “BDM v1.0” reference.
- Reconcile PRD generic keeper-post and rejection-to-draft prose with D-LIFE-01,
  including the explicit Revise boundary and immutable actual-event history.
- Reconcile PRD disposal keeper-create/submit prose with D-ADJ-01's
  manager-owned adjustment exception.
- Mark `SoftFreeze` as the v1-supported subset and HardFreeze/NoFreeze as v2
  in the PRD enum/scope text.
- Align historical stock/asset event names with D-RAE-01 and record
  ExternalParty plus the adjustment purpose/asset-line semantics from the
  approved decisions.
- Replace independent `requires_asset_number` behavior with D-MAT-01's policy
  matrix; distinguish internal asset number from manufacturer serial, and
  record the Durable-custody contract gap.
- Move the base-unit relationship from MaterialFamily/warehouse historical
  sketches to Material. Replace nullable/global or conversion-chain sketches
  with D-UOM-01's per-material, alternate-to-base rule and DocumentLine
  conversion/factor/base-quantity snapshot.

### OpenAPI / backend contract

- Export generated models for every BDM domain/read model, scoped permissions,
  optimistic concurrency, lifecycle/actions, and server policy responses.
- Publish canonical movement/asset events, derived asset status, SoftFreeze
  advisory, ExternalParty lookup/administration, and active/historical
  counterpart resolution.
- Add D-ADJ-01's `adjustmentPurpose` and nullable line `assetId`, with
  purpose-specific validation and terminal-disposal response semantics.
- Publish attachment verification and all remaining errors/endpoints before
  frontend feature tasks write service or form code.
- Publish the Durable-custody subject, quantity/serial identity, partial
  assignment/return, and legacy-remediation contracts before custody features.
- Publish the D-UOM-01 material-conversion read/create/update surface, positive
  decimal factor, active/archive state, row version, and posting-line snapshot
  fields before unit-conversion production integration.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t02` | Treat this BDM and its referenced decisions as the domain inventory for the versioned OpenAPI gap analysis. |
| `e01.6` | Publish the D-OAS-02 provisional OpenAPI snapshot and provenance, then hand backend compatibility to an explicit ratification gate. |
| `e01.7` | Ratify the provisional snapshot against backend/Apidog evidence before production integration. |
| `e01-t04` | Apply D-LIFE-01 to the provisional OpenAPI and downstream lifecycle infrastructure. |
| `e01-t05`–`e01-t07` | Complete the remaining attachment, audit, and permission decisions without contradicting this model or D-LIFE-01. |
| `e09.1` | Deliver ExternalParty administration as required reference data, not a free-text issue/custody fallback. |
| `e10-t09` | Implement D-MAT-01 catalog policy from a generated contract; never expose an independent asset-number toggle. |
| `e10-t11` | Implement D-UOM-01 material unit-conversion management from generated provisional types; do not add a global unit factor or client-side posting calculation. |
| `e19-t01`â€“`e19-t09` | Consume the Asset/Durable custody-subject contract; Durable custody is not the current asset-only timeline. |
| All feature/service tasks | Consume generated OpenAPI models, respect bounded contexts, and do not recreate an absent domain field or business rule. |

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Treat the PRD or ERD as an implicit BDM | Both contain known conflicts and neither designates a repository-resolvable canonical BDM artifact. |
| Waive BDM alignment indefinitely | Leaves every frontend and OpenAPI task to infer semantics independently, undermining traceability. |
| Write a complete new BDM from architectural preference | Would invent business rules beyond the documented sources. This baseline records only sourced/approved behavior and visible gaps. |
| Treat serial number as asset number | Conflates physical identity with accounting classification and registers Durable items incorrectly. |
| Treat database tables as frontend models | Violates the generated OpenAPI boundary and locks UI behavior to historical persistence terminology. |

## Consequences

This BDM releases the missing-source blocker for the OpenAPI inventory while
preserving the remaining explicit decision blockers. Its next change must
identify the Beads decision, provenance impact, PRD/OpenAPI consequence, and
version increment; otherwise it is not authoritative for EIAMS planning.
