# EIAMS V1 OpenAPI Contract Surface Inventory and Publication Gate

**Status:** Provisional architecture snapshot admitted; backend ratification pending  
**Beads:** `eiams-frontend-e01-t02`  
**External publication gate:** `eiams-frontend-e01.6`  
**Decision date:** 2026-08-09

## Decision

The backend API and authoritative Apidog project are not yet available. By
explicit project-owner authorization, `e01.6` therefore publishes an
architecture-owned, design-first OpenAPI 3.0.3 snapshot derived from the PRD,
BDM, ERD/schema evidence, and approved P0 decisions. It is the provisional
transport contract for Apidog mocks and deterministic frontend generation.

Frontend code still must not handwrite competing endpoint paths, DTOs, enum
aliases, pagination envelopes, error shapes, upload mechanics, or API
services. The provisional snapshot does not claim that backend endpoints exist,
and production integration remains a **no-go** until the backend/API owner
ratifies it or publishes an explicitly versioned replacement.

The canonical repository input location is
`contracts/openapi/eiams-v1.openapi.json`. Its companion provenance record is
`contracts/openapi/eiams-v1.provenance.json`. `e01.6` owns publishing and
validating this provisional input; `e08-t01` owns generator configuration after
the gate is satisfied. Neither task may change the semantic decisions cited in
this document. Backend divergence must be resolved as a reviewed contract
change, never as an untracked frontend patch.

## Governing sources

| Source | Contract consequence |
| --- | --- |
| PRD chapters 9–10 and the v1 BDM | Define entities, authoritative business invariants, and semantic enums to be represented—not inferred—in the API. |
| SAD section 9 | Requires one Axios/shared API layer and Apidog OpenAPI 3.0 → `openapi-typescript` → OpenAPI-Qraft generation. |
| AGENTS.md | Prohibits direct `fetch`, requires generated types, TanStack Query server state, server-side tables, and Arabic failure feedback. |
| D-POST-01 | Requires UUID counterpart references, normalized active search/historical resolution, and ExternalParty contract support. |
| D-RAE-01 | Requires canonical stock/asset event records, event provenance, and server-derived asset status. |
| D-ADJ-01 | Requires adjustment purpose, line-level asset reference, disposal terminal behavior, and policy/action read models. |
| D-ICF-01 | Requires the v1 SoftFreeze-only count value and reusable non-blocking operational advisories. |
| D-LIFE-01 | Requires explicit generic/adjustment/disposal transitions, immutable actual-event history, action presentation, typed reason/version requests, and compensating reversal references. |

## Source-snapshot admission requirements

Before any generated API code or contract-backed frontend service is accepted,
the publication gate must provide all of the following:

1. A valid OpenAPI **3.0.x** JSON export at the canonical input location.
2. A provenance record containing the source kind, publication timestamp,
   `info.version`, SHA-256 of the committed snapshot, and ratification state.
   Apidog project/environment and backend revision identifiers are mandatory
   when an upstream artifact exists; a design-first snapshot must explicitly
   record their absence rather than inventing them.
3. One security-scheme definition and documented authentication/refresh
   interaction suitable for the session decision. No page-specific tokens or
   ad-hoc headers are permitted.
4. Stable `operationId` and tag metadata for every operation, so generated
   names and module ownership do not depend on paths alone.
5. Fully declared request, response, nullability, validation, and error
   schemas. A prose description or example without a schema is insufficient.
6. A validation result proving the snapshot is consumable by the selected
   generator. Generator configuration, output location, and CI drift checking
   remain `e08-t01`/`e08-t02` work.

The version/digest pair is the only source accepted for code review and CI.
Replacing the snapshot or changing a published operation/schema requires a
version change, updated provenance, regeneration, and a compatibility review.

## Required cross-cutting contract surface

The API export must explicitly specify these patterns wherever applicable.
Exact field/property spellings are intentionally not invented here; the export
pins them before code generation.

| Surface | Required contract behavior |
| --- | --- |
| Identity and scope | D-AUTH-01 pins memory-only bearer access tokens, rotating HttpOnly refresh-cookie transport, authoritative session/bootstrap identity, hierarchical Enterprise/Site/Warehouse scope selection, effective roles/permissions, logout, and unauthorized-versus-forbidden behavior. D-RBAC in `e01-t07` pins the exact permission vocabulary. |
| List/query results | Server-side pagination, sort, filter, and search request/response schema; total/count or continuation semantics; consistent empty-page behavior; stable item identity. |
| Errors | A shared machine-readable error code, Arabic safe display message or approved localization key/parameters, field-level validation details, correlation/trace identity when available, and conflict/authorization/not-found distinction. |
| Mutation safety | Explicit request concurrency token/version for mutable resources and documented conflict response. Post/reverse and other irreversible document actions must be idempotent or expose an idempotency mechanism. |
| Attachments | Upload transport/content type and size/type failure contract; attachment identity; `SignedOriginal` versus `Supporting`; verification/policy state; listing/removal/read/download authorization. Exact signed-original gate semantics remain `e01-t05`. |
| Data formats | UUID identity, date/time/time-zone representation, decimal quantity/price representation, nullable versus omitted fields, enum serialization, and localized display fields must be explicit rather than inferred from SQL types. |
| Read projections | List/detail/lookup projections must include the display labels and immutable provenance needed by the UI; the client must not join incomplete entity data or reconstruct history. |
| Policy/preflight | Capability, balance, lifecycle, signed-original, active-count, and action-availability responses distinguish blocking failures from the D-ICF-01 advisory warning. |

## Required domain inventory

Every v1 BDM domain must be covered by operations and schemas appropriate to
its role. This table intentionally identifies contract coverage, not guessed
HTTP paths or payload property names.

| Domain / tag | Required operations and projections |
| --- | --- |
| Authentication and authorization | Session/bootstrap, refresh/logout where applicable, effective scope, role/permission/action visibility, and user identity. |
| Organization and counterparties | Sites, organizational units, employees, scoped active counterpart search, historical counterpart resolution, and controlled ExternalParty list/create/edit/deactivate operations. |
| Catalog | Unit of measure, domain/category/family/material lookup and management, authoritative material kind/tracking, and hierarchy-derived display fields. |
| Warehouse | Warehouses, capabilities/allowed operations, material settings, scoped warehouse selection, and capability policy/preflight data. |
| Inventory | Warehouse/material balances, current availability where the business policy exposes it, StockMovement ledger lists/details, immutable provenance, and canonical movement enums. |
| Shared documents | WarehouseDocument list/detail/draft mutation, lines, attachments, D-LIFE-01 action availability, immutable lifecycle/history envelope, policy/preflight, optimistic concurrency, explicit Revise, and typed lifecycle actions. |
| Receiving, issue, transfer, opening, return | Type-specific petal fields and action payloads; asset-line behavior; source/destination or counterpart context; capability and balance effects. Return must expose its original-issue traceability rather than leaving the UI to infer it. |
| Inventory count | Plan/scope/snapshot/start/entry/complete/close, count lines/variance, a single accepted `SoftFreeze` policy, and active-count advisory response. |
| Adjustment and disposal | Adjustment purpose, count reference where valid, signed lines, nullable line asset reference, manager lifecycle/action availability, ordinary reversal, eligible disposal asset lookup, and terminal disposal result/history. |
| Asset and custody | Asset registry/detail, authoritative derived status, immutable asset event history, current/past custody, assignment/transfer/return/disposal effects, and historical counterpart display. |
| Audit and reports | Redacted audit list/detail/entry projections, report/KPI filters and data/print-export contracts once their owning decisions specify them. |

## Canonical semantic compatibility requirements

The published OpenAPI must follow the approved domain semantics below. These
are not frontend translations of legacy values.

| Historical or ambiguous term | Required v1 contract meaning |
| --- | --- |
| Stock `Receiving` or `Return` movement | Canonical `Receipt` with signed positive quantity where applicable. |
| Generic stock `Adjustment` / increase / decrease | Canonical `AdjustmentIn` or `AdjustmentOut`, selected from signed effect. |
| Asset event `Adjusted` or `Transferred` | Not emitted in v1. Asset events are `Received`, `Issued`, `Returned`, `Disposed`. |
| Asset status persisted/mutated by client | A server-derived read-only status projection. |
| Counterpart `External` free text | `External` type with a UUID to ExternalParty; active writes and historical read resolution are server-authoritative. |
| Count freeze enum | `SoftFreeze` only in v1; HardFreeze and NoFreeze are unsupported values. |
| Adjustment `Submitted`/`Approved` or generic disposal | Manager-owned `Draft`, `Posted`, `Reversed` adjustment; explicit purpose and line asset reference; disposal is terminal. |
| Generic document timeline fabricated from state | D-LIFE-01 immutable, oldest-first server events containing actor snapshots and resulting row versions; no inferred, pending, Approved, or draft-update entries. |

## Downstream frontend policy

- Feature services may begin only after generated types/client code exist; they
  call the shared generated API layer through TanStack Query, never `fetch` or
  handwritten authoritative Axios DTOs.
- Form schemas are derived from/generated alongside the published contract and
  may add only presentation-level validation already guaranteed by an approved
  business decision. A browser cannot relax server validation.
- Tables use the exact server pagination/filter/sort contract. They do not
  switch to client-side pagination because a list endpoint is incomplete.
- UI displays server-provided Arabic failure text or a contract-approved
  localized message mapping. It does not convert undocumented HTTP text into a
  business policy.
- MSW handlers and integration tests derive from the committed snapshot only;
  mock-only endpoint shapes cannot become de facto API contracts.

## Publication outcome and remaining gate

The provisional snapshot now pins operation paths, stable operation IDs,
transport envelopes, status codes, upload protocol, pagination, errors, and
the v1 domain schemas. Its provenance records that it is architecture-owned,
not a backend or Apidog export. This satisfies the deterministic-generation
input gate for development and mocking.

`e08-t01` can configure generation from the admitted snapshot after `e01.6`
closes. Feature implementation remains protected by the generated-client chain
already in the Beads graph. Production integration additionally requires
backend ratification. Any semantic discrepancy is returned to the owning P0
decision (D-POST-01, D-RAE-01, D-ADJ-01, D-ICF-01, D-LIFE-01, or the remaining e01
decisions) and resolved through a versioned OpenAPI/provenance update, not
patched in frontend code.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Handwrite TypeScript interfaces and Axios calls directly from PRD/ERD/schema | Bypasses the reviewed design contract, source precedence, provenance, and deterministic generation, guaranteeing drift. |
| Generate from a live, unversioned Apidog URL | Makes builds non-reproducible and prevents review of contract changes. |
| Treat MSW fixtures as an API specification | Test doubles cannot establish backend behavior, authorization, or error semantics. |
| Start with generic REST path conventions and revise later | Invents endpoint/action semantics in an audit-critical system. |
| Permit each feature to define pagination/errors/uploads locally | Creates incompatible reusable infrastructure and violates the SAD shared API boundary. |

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01.6` | Publish and validate the architecture-owned provisional v1 snapshot/provenance; record mandatory backend ratification. |
| `e01.7` | Ratify the provisional snapshot against the implemented backend and authoritative Apidog project before production drift enforcement. |
| `e01-t03` | Maintain D-AUTH-01 token, session, and active-scope semantics in the admitted snapshot. |
| `e08-t01`, `e08-t02` | Configure and run deterministic generation only from the admitted snapshot. |
| `e01-t04` | Maintain D-LIFE-01 lifecycle/action/history semantics in the admitted snapshot. |
| `e01-t05`–`e01-t07` | Pin the remaining attachment, audit, and permission decisions and map them into the published contract without inventing paths or envelopes. |
| `e09.1`, all service/type/form/table tasks | Consume only generated, contract-backed types and operations. |
| `e01-t08` | Verify architecture readiness includes the source snapshot, provenance, generation, and contract drift gates. |

## Consequences

This decision now provides both a complete, reviewable contract inventory and
an admitted provisional source snapshot. After `e01.6` completes, `e08-t01`
can configure deterministic generation and the implementation graph can
advance without per-feature API guesswork. Backend/API-owner ratification
remains mandatory before production integration.
