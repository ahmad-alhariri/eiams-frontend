# Single-role / single-scope user assignment decision

**Decision ID:** D-SRS-01  
**Status:** Accepted frontend architecture decision; backend contract enforcement pending ratification  
**Beads:** `eiams-frontend-7ipk.1` (decision), `eiams-frontend-7ipk.5` (backend-enforcement record)  
**Related contract gates:** `eiams-frontend-e01.7`, `eiams-frontend-whhu.1`, `eiams-frontend-whhu.7`, `eiams-frontend-whhu.10`, `eiams-frontend-whhu.11`  
**Decision date:** 2026-09-01

## Decision

EIAMS v1 assigns every User exactly one persistent `UserRoleScope` row. That
row contains exactly one Role and exactly one scope:

- `Enterprise`, with `scopeId = null`;
- `Site`, with that Site's UUID; or
- `Warehouse`, with that Warehouse's UUID.

Creating an account without an assignment is not permitted. The account and
its required assignment are created or rejected as one server-owned operation;
there is no durable zero-assignment state for normal administration.

The assignment's position in the organization hierarchy expands its **effective
authorization**, not its assignment cardinality. For example, a `WH_MGR`
assigned at a Site may operate in warehouses in that Site, but still has one
role and one assigned scope. The UI and API never fan that relationship out
into additional role-scope rows.

## Session and authorization consequences

The authoritative session has one required `activeScope`, representing the
user's sole persistent assignment. `scopeState` is `Selected` while that
assignment is valid and `Unavailable` only when the server detects it as
invalid; no other state is valid. The session does not expose
`availableScopes`, and `SelectionRequired` is not a valid session state. The
browser does not choose among scopes or calculate inheritance; it consumes the server-calculated
`permissionCodes` and effective role information for `activeScope`.

`Unavailable` is reserved for a server-detected inactive, expired, or otherwise
invalid assigned row. It is not a way to create or retain a user with zero
assignments. In that state the server returns no usable permissions and the
frontend blocks feature access with the established Arabic contact-administrator
experience. The required `activeScope` still identifies the sole assigned
context; it does not authorize an operation while the assignment is invalid.

## Backend authority and contract requirement

The frontend is defense in depth only. The backend is authoritative for this
invariant across administration, direct API clients, imports, and concurrent
requests.

1. The persistence model enforces one `UserRoleScope` row per `user_id`.
2. Account creation requires the single role-scope assignment in the same
   server-owned transaction/workflow.
3. Replacing an assignment is atomic: the request carries one role-scope
   assignment and the resulting user has exactly one row.
4. The API rejects a request containing more than one role or more than one
   scope for the user. It also rejects an omitted assignment rather than
   silently creating a zero-assignment account.
5. Scope existence, scope-type/identifier consistency, assignment validity,
   and the administrator's authority to assign the scope remain backend checks.

`eiams-frontend-e01.7` owns ratification of the versioned OpenAPI and backend
implementation, and `eiams-frontend-whhu.11` is the dedicated backend
lifecycle prerequisite implementing this enforcement. That ratification must
publish the singular replacement endpoint `GET`/`PUT
/api/v1/admin/users/{userId}/role-scope` (singular `role-scope`, not plural
`role-scopes`) with its singular replacement request/response shape and
validation/error semantics: the request carries exactly one assignment
(`roleId`, `scopeType`, `scopeId`), with no `assignments` collection and no
`rowVersion`, and the response is the stored singular assignment projection.
An `assignments` collection is not part of the accepted v1 contract. No
handwritten frontend adapter may conceal a different backend behavior.

## Frontend prevention and Arabic scope selection

The administration UI presents one role and one scope form, not an editable
assignment collection. It validates the single assignment before submission and
submits it through the shared administration service. It must not add a second
row, remove the only row, or synthesize hierarchy-derived assignments.

The scope input is an Arabic, accessible asynchronous selector rather than a
raw UUID field. Site and warehouse lookup adapters expose only scopes that the
current administrator is allowed to see; the server still validates the final
selection. Enterprise is represented with its contract-defined null identifier.

## Rationale

One durable assignment gives EIAMS an unambiguous accountable role and working
scope for every user. It supports separation of duties in a government
oversight system while retaining legitimate Enterprise, Site, and Warehouse
coverage through server-owned hierarchy evaluation. It also removes an
otherwise unnecessary client-side scope choice and prevents stale multi-scope
authorization state.

## Compatibility and reconciliation

This decision supersedes the prior multi-assignment cardinality described in
the PRD/ERD/schema and the multi-scope session consumption model where those
statements concern v1 user assignment cardinality. It does not change the
existing permission vocabulary, hierarchy semantics, token transport, or the
rule that the server authorizes every request.

The provisional OpenAPI remains provisional until `eiams-frontend-e01.7`
reviews the backend implementation and publishes a versioned reconciled
contract/provenance record. `eiams-frontend-whhu.11` implements the
backend/database/API enforcement as the dedicated exactly-one lifecycle
prerequisite. `eiams-frontend-whhu.1`, `.7`, and `.10` implement
and verify the direct-integration/session consequences. The frontend tasks
`eiams-frontend-7ipk.2`, `.3`, and `.4` consume this decision; `.5` records the
backend-authoritative requirement above.

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Multiple roles across warehouses or scopes | Breaks the v1 separation-of-duties and audit-accountability rule. |
| Multiple rows inferred from a Site or Enterprise assignment | Confuses effective hierarchy coverage with a user's durable assignment. |
| Client-side-only validation | A direct client or concurrent request could bypass it; the server is authoritative. |
| A raw UUID scope field | Does not express scope visibility, is error-prone, and bypasses the reusable Arabic lookup experience. |
| An unassigned account as a normal state | Contradicts the required exactly-one assignment and leaves no accountable working scope. |

## Affected Beads

- `eiams-frontend-7ipk.2` — require exactly one assignment in the form schema.
- `eiams-frontend-7ipk.3` — render the singular role/scope editor and selector.
- `eiams-frontend-7ipk.4` — verify login/session behavior with the sole scope.
- `eiams-frontend-7ipk.5` — preserve the backend-authoritative requirement in
  this decision record.
- `eiams-frontend-e01.7` — ratify the backend/database/API implementation and
  versioned OpenAPI consequences before production integration.
- `eiams-frontend-whhu.1`, `.7`, `.10` — reconcile, implement, and smoke-test
  the production session and OpenAPI contract.
- `eiams-frontend-whhu.11` — enforce the exactly-one user role-scope
  lifecycle in the backend/database/API (dedicated prerequisite).
