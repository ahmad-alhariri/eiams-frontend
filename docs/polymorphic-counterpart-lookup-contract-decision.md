# Polymorphic Counterpart Lookup Contract Decision

**Status:** Approved for EIAMS v1 frontend and OpenAPI planning  
**Beads:** `eiams-frontend-e01.5`  
**Decision date:** 2026-08-09

## Decision

EIAMS v1 supports the same counterpart enum for both `IssueTo.recipient_type`
and `Custody.holder_type`:

`Employee | OrganizationalUnit | Site | External`

All counterpart identities use UUIDs. Employee, OrganizationalUnit, and Site
continue to use their existing authoritative entities. `External` is a new
backend reference entity, **ExternalParty**, with at least a UUID identity,
Arabic display name, and soft-deactivation status (`Active`/`Inactive`). It
must be represented in the versioned OpenAPI contract before frontend API work
begins. It is not free text and it is not a frontend-only record.

This decision is the contract-semantic source for the OpenAPI inventory task.
That task pins endpoint paths, generated type names, pagination envelopes, and
transport error serialization without changing the semantics below.

## Governing sources

- PRD D-POLY-01 requires UUID polymorphic references, application-layer
  existence/active validation, database guard triggers, and housekeeping.
- PRD §10 enumerates Employee, OrganizationalUnit, Site, and External for
  both recipient and holder types.
- PRD §3.5–§3.6 distinguishes operational responsibility from personal
  custody, and PRD §12.3 defines Employee as personal while OrganizationalUnit
  and Site are operational on asset issue.
- The requirements conflict matrix records that ERD/schema/Architecture
  Overview type sets are stale where they conflict with the PRD.

## Counterpart matrix

| Target type | Stable identifier | Eligible for IssueTo | Eligible for Custody holder | Custody kind allowed | Selection status |
| --- | --- | --- | --- | --- | --- |
| Employee | `employee_id` UUID | Yes | Yes | Personal only | Active only |
| OrganizationalUnit | `org_unit_id` UUID | Yes | Yes | Operational only | Active only |
| Site | `site_id` UUID | Yes | Yes | Operational only | Active only |
| External | `external_party_id` UUID | Yes | Yes | Operational only | Active only |

`Personal` is deliberately limited to Employee. External is operational: it
matches the PRD definition of operational responsibility as the party that
received an asset from the warehouse and avoids assigning personal legal
custody to an entity that is not an EIAMS employee.

## Lifecycle behavior

| Operation | Allowed counterpart and resulting custody behavior |
| --- | --- |
| Issue of consumables | Any active counterpart is allowed; no Custody row is created. |
| Issue of durables | The recipient must become responsible through D-MAT-01's provisional `MaterialQuantity` or `TrackedUnit` custody subject. Backend implementation and ratification remain required; no fake Asset or client-only record is allowed. |
| Issue of assets to Employee | Create Personal custody for the selected Employee. |
| Issue of assets to OrganizationalUnit, Site, or External | Create Operational custody for the selected counterpart. |
| Pending-custody assignment | The new holder must be an active Employee; it creates Personal custody and closes the prior Operational row. |
| Custody responsibility transfer | For Assets, active Employee creates Personal custody; active OrganizationalUnit, Site, or External creates Operational custody. The server closes the previous active row atomically. D-MAT-01's provisional contract provides equivalent Durable subject transfer, including partial quantity; backend ratification remains required. |
| Return and historical views | Display the counterpart from the server read model even after deactivation; the historical record remains immutable. |

## Lookup and read-model contract

The generated API must expose these semantic operations:

1. **Search active counterparts** by free-text query, target-type filter, and
   server pagination. The response is a normalized option containing at least
   `type`, `id`, `displayName`, `status`, and an optional Arabic secondary
   label. The caller may provide a UI-selected site context, but the server is
   authoritative for RBAC and scope filtering.
2. **Resolve historical counterpart references** by `(type, id)` for document,
   custody, and audit read models. Inactive records remain resolvable and are
   labeled inactive; they must never reappear as write choices.
3. **Validate a write candidate** server-side for type/id consistency,
   existence, active status, and the caller's effective scope. The operation
   may be implicit in create/update/submit/post endpoints; it must not rely on
   the browser's prior lookup result.

The UI uses the shared `AsyncSelect` and scoped selector adapters after their
own Beads are complete. It debounces remote search, submits only the UUID plus
type, shows Arabic loading/empty/error states, and never stores counterpart
server data in Zustand.

## Scope and authorization

The counterpart search and validation service applies the authenticated user's
effective Enterprise/Site/Warehouse scope on the server. The client never
widens results by changing a query parameter.

- Enterprise scope may search authorized active counterparts across the
  organization.
- Site and Warehouse scopes may search only counterparts authorized for the
  effective site; a warehouse inherits its owning site's counterpart boundary.
- External parties are enterprise reference data but are returned only when
  the caller is authorized to create or change the owning document/custody
  operation in its effective scope.

The route permission and session/scope decisions retain ownership of concrete
permission codes and session representation.

## Validation and errors

Validation occurs on every create/update and is repeated at Submit/Post or
Custody activation to prevent stale selections. Server responses distinguish,
at minimum, these semantic failures:

| Condition | Required frontend behavior |
| --- | --- |
| Unknown type or type/ID mismatch | Preserve draft input, show inline Arabic validation error, and prevent progression. |
| Counterpart not found | Mark selection stale, require a new active selection, and keep the draft recoverable. |
| Counterpart inactive | Display the historical label read-only; block new selection and writes with an Arabic remediation message. |
| Counterpart outside effective scope or unauthorized | Do not disclose unavailable choices; show a generic Arabic authorization/scope error if a stale draft is submitted. |
| Invalid custody-kind pairing | Block client submission where determinable and rely on the server as final authority. |

Exact HTTP statuses and machine-readable codes are owned by
`eiams-frontend-e01-t02` when the OpenAPI contract is pinned.

## ExternalParty compatibility requirements

The backend/domain model must add ExternalParty as v1 reference data and
provide controlled creation/deactivation outside Issue and Custody forms.
Hard deletion is prohibited once referenced. The initial frontend execution
graph therefore includes a dedicated organization-administration task rather
than allowing a document screen to create anonymous counterpart records.

## Rejected alternatives

| Alternative | Rejection rationale |
| --- | --- |
| Free-text External recipient/holder | Violates the PRD UUID and active-validation requirements, breaks audit consistency, and cannot support scope checks. |
| Remove External from v1 | Contradicts the PRD enum and operational-responsibility definition. |
| Treat all counterpart types as Personal custody | Contradicts the Employee-only personal custody rule and eliminates pending operational custody. |
| Client-side lookup filtering or validation | Cannot enforce scope, active status, or race-safe posting; the PRD requires application-layer backend enforcement. |
| Feature-specific Issue/Custody selectors | Duplicates shared async-selection behavior and makes policy drift likely. |

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e01-t02` | Pin ExternalParty and normalized counterpart APIs in OpenAPI. |
| `e01-t03`, `e01-t07` | Define concrete permission codes and active-scope representation consumed by counterpart APIs. |
| `e04-t08`, `e04-t12` | Provide accessible shared async/scoped selector infrastructure. |
| `e09-t09` | Implement active and historical counterpart lookup adapters from the generated contract. |
| `e16-t03`, `e16-t06` | Use the Issue recipient matrix and responsibility preview. |
| `e19-t03`, `e19-t05` | Use the custody assignment and transfer matrix. |
| `eiams-frontend-bt60`, `e10-t09` | Consume D-MAT-01; do not offer an independent asset-number toggle or Durable-as-Asset workaround. |
| `e09.1` | Deliver controlled ExternalParty reference-data administration. |

## Consequences

This adds ExternalParty to the backend v1 contract beyond the historical
38-entity documentation. It is necessary to make the PRD's `External` enum
auditable, active-validatable, scope-aware, and usable without inventing
frontend persistence. The OpenAPI inventory and BDM work must record the
resulting entity and operations before code generation.
