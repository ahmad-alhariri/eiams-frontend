# Direct Integration Policy and Contract Reconciliation Decision

**Decision ID:** D-INT-01  
**Status:** Superseded in part by D-INT-02 on 2026-09-02  
**Beads:** `eiams-frontend-whhu` (epic), `eiams-frontend-whhu.1` (this decision)  
**Amends:** D-AUTH-01 v1.0.1 → v1.1.0  
**Aligns with:** D-SRS-01, D-MAT-01, and D-UOM-01  
**D-SRS prerequisite:** `eiams-frontend-whhu.11` owns backend/database/API enforcement before session and production-contract work is accepted.

> D-INT-02 preserves direct backend integration and the D-SRS-01 singular
> assignment/session model, but supersedes this document's OpenAPI-to-TypeScript
> generation strategy. The frontend now uses handwritten generic transport and
> per-module contract types. See `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md`
> and `docs/direct-backend-integration-plan.md`.

## Purpose and authority

D-INT-01 adopts direct, production-aligned integration between the frontend and
the .NET backend. The backend's real OpenAPI export is the only API source of
truth; `openapi-typescript` regenerates frontend types from that export. The
former hand-written provisional snapshot is historical input only and cannot be
used as a parallel source or hidden behind handwritten frontend adapters.

This decision reconciles route grouping, authentication/session transport,
response envelopes, CORS, versioning, generation workflow, and the D-SRS-01
single-assignment model. It does not change D-SRS-01's business invariant,
D-AUTH-01 token safety rules, D-MAT-01 material semantics, or D-UOM-01 decimal
semantics.

## Direct-integration policy

- The backend uses the documented `/api/v1` route grouping, including
  `/auth/*`, `/admin/*`, `/catalog/*`, `/inventory/*`, and `/adjustments/*`.
- Login uses `username` and `password`; `Email` is not a substitute login
  identity.
- API success responses use `{ success, data, pagination?, meta }`; errors use
  `{ success: false, error }`. The real OpenAPI publishes the exact schemas.
- Refresh credentials remain host-only, `HttpOnly` cookies scoped to
  `/api/v1/auth`; browser JavaScript never receives or persists a refresh
  token.
- CORS allows the configured frontend origins and credentialed auth requests;
  all other origins are denied.
- Backend decimal serialization must preserve D-UOM-01's `DECIMAL(18,6)`
  contract. `whhu.10` verifies that behavior in the integrated environment.

## D-SRS-01 session and assignment model

Every User has exactly one persistent `UserRoleScope`: one Role at exactly one
Enterprise, Site, or Warehouse scope. Account creation persists that required
assignment atomically with the User. A normal administration lifecycle never
creates, grants, removes, or revokes an account into a zero-assignment state.

`UserRoleScope.user_id` is unique. Role/scope changes atomically replace the
sole assignment rather than appending rows. The hierarchy expands effective
authorization only: a Site or Enterprise assignment can cover descendants, but
does not create additional assignment rows.

The authenticated session has:

- required `activeScope`, representing the sole assigned context;
- `scopeState` of `Selected` or `Unavailable` only;
- effective role information and `permissionCodes` calculated by the server.

It has no `availableScopes` collection and no `SelectionRequired` state.
`Unavailable` is reserved for a server-detected inactive, expired, or otherwise
invalid sole assignment. It is never the result of creating a User without an
assignment. The server returns no usable permissions in that state and the
frontend renders the established Arabic contact-administrator experience.

The normal UI renders `activeScope` as a static current-context label. It never
offers a scope picker or derives a scope from an array. The frontend's Arabic
role/scope editor presents one accessible role and scope form; its lookup
adapters expose only scopes the administrator may see, while the server
validates the final selection.

## Backend-authoritative enforcement

`whhu.11` is the dedicated prerequisite that implements and publishes this
invariant. It must provide all of the following before `whhu.7` and `whhu.10`
are accepted:

1. A database uniqueness constraint for `UserRoleScope.user_id`.
2. Atomic User creation with one required role-scope assignment.
3. Atomic replacement with one assignment; no remove/revoke endpoint or
   workflow may leave a durable zero-assignment User.
4. A singular `GET`/`PUT /api/v1/admin/users/{userId}/role-scope` contract:
   the read projects one assignment and the replacement request carries one
   assignment. The contract accepts no assignments collection or compatibility
   array.
5. Server validation of role, scope type/identifier consistency, scope
   existence, assignment validity, and the administrator's authority. Direct
   clients and concurrent requests receive the same enforcement.

The frontend is defense in depth only. It must not invent an error vocabulary,
adapt a different backend payload by hand, or treat client validation as
authorization. `whhu.11` publishes the versioned error/status semantics through
the real OpenAPI.

## Authorized administration override

`PUT /api/v1/auth/active-scope` remains only for an explicit, authorized admin
override, such as an audited impersonation or debugging workflow. It is not an
ordinary-user scope selector, does not persist another assignment, and always
returns the recomputed authoritative session. `whhu.7` owns this endpoint after
the `whhu.11` prerequisite is satisfied. Protected/scoped query caches are
invalidated before the returned override session becomes visible.

## Implementation and verification

- `whhu.2` exports the real backend OpenAPI on development startup.
- `whhu.3` repoints deterministic frontend type generation to that export.
- `whhu.4` supplies environment-driven API base URLs.
- `whhu.5` removes the provisional snapshot from the active source chain.
- `whhu.6` applies the documented auth/login and `/api/v1` integration routes.
- `whhu.11` enforces D-SRS-01 before `.7` and `.10`.
- `whhu.7` adds only the authorized-admin active-scope override endpoint.
- `whhu.8` and `.9` complete resource route grouping and CORS.
- `whhu.10` smoke-tests the production contract and records its delta.

`whhu.10` verifies required `activeScope`, absent `availableScopes` and
`SelectionRequired`, static ordinary-user context, invalid-assignment
`Unavailable`, zero-assignment rejection, singular role-scope replacement,
authorized override behavior, cookie/CORS controls, decimal precision, and
deterministic type regeneration.

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Keep the provisional snapshot as a parallel truth | Produces untracked contract drift. |
| Patch frontend services to match unratified backend differences | Breaks generation traceability and hides incompatibilities. |
| Keep multi-scope selection or an array of one scope | Contradicts D-SRS-01 and leaves dead client authorization paths. |
| Client-only role-scope validation | Direct clients and concurrent requests could bypass it. |
| A normal unassigned account state | Removes the accountable role and working context required by D-SRS-01. |
