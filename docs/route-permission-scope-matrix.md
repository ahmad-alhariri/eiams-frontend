# EIAMS Route Permission and Scope Matrix Decision

**Status:** Approved frontend and provisional API contract decision
**Decision ID:** D-RBAC-01
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01-t07`
**Decision date:** 2026-08-09

## Decision

EIAMS v1 authorization is expressed as a flat vocabulary of exact
`resource.verb` permission codes. Every route, navigation item, and guarded
action references one or more codes, all of which arrive exclusively through
the server-authored `SessionResponse.permissionCodes` at the active scope
(D-AUTH-01). There is exactly one canonical vocabulary; it lives in this
document, becomes the typed constant surface in the frontend
(`src/config/permissions.ts`), and must match the OpenAPI `permissionCodes`
values and the `/admin/permissions` catalog.

The frontend enforces **visibility, not authority**. A route or control hidden
or blocked by the matrix is a convenience and a defense-in-depth layer; the
server re-evaluates every request, state transition, and policy action. No
client check ever authorizes an operation.

## Problem being solved

The governing sources fix RBAC (Role ↔ Permission via `RolePermission`,
`UserRoleScope` at Enterprise/Site/Warehouse scope) and the session transport
(D-AUTH-01) but do not pin the concrete code vocabulary, the route-to-code
assignment, the seed-role permission sets, or pre-action guard semantics — so
each feature would otherwise invent its own strings (`canEditDoc`, `isManager`)
and drift from the backend. The provisional contract ships `permissionCodes`
as an open string array with a single `document.post` example, so this
decision fixes the vocabulary the contract must ratify and the predicates the
UI must consume.

## Governing evidence

| Source | Governing consequence |
| --- | --- |
| PRD Chapter 5 | `Role` ↔ `Permission` via `RolePermission`; `UserRoleScope` grants roles Enterprise/Site/Warehouse; atomic permissions. |
| PRD Chapter 12 prerequisite 1 | Every operation requires the relevant permission within the target warehouse scope. |
| D-WF-01 and D-LIFE-01 | Keeper creates/submits; manager posts/rejects; cancellation pre-posting; reversal with documented reason. Action presentation is server-owned. |
| D-ADJ-01 | Adjustment and Disposal are manager-owned; keepers never see Create/Edit/Post for them. |
| D-ICF-01 | Managers own plan/start/complete/close; keepers enter actual quantities. |
| D-AUTH-01 | `permissionCodes` are effective at the selected scope; `401` ≠ `403`; the session is the only source. |
| D-OAS-01/02 | Stable operation IDs and typed schemas; no ad-hoc headers; generated clients only. |
| SAD §7, §11-12 | Routes in `src/config/routes.ts`; permission gates on routes, navigation, menus, buttons; policy allows/errs; Arabic failure feedback. |
| AGENTS.md | `usePermission` gates every action; permission keys match .NET backend codes (e.g., `document.create`, `document.post`). |

## Canonical permission vocabulary (v1)

Naming convention: `resource.verb`, all lower case, ASCII. Verbs:
`view`, `create`, `update`, `manage` (full CRUD on master data),
`submit`, `post`, `reject`, `revise`, `cancel`, `reverse` (document
actions), `plan`, `enter`, `complete`, `close` (count), `assign`
(custody).

| Code | Primary scope | Meaning |
| --- | --- | --- |
| `catalog.view` | Enterprise | Read material domain/category/family/material/unit-of-measure. |
| `catalog.manage` | Enterprise | Create/update/deactivate catalog entities. |
| `organization.view` | Enterprise | Read sites, organizational units, employees, external parties/counterparts. |
| `organization.manage` | Enterprise | Create/update/deactivate organization references and counterparts. |
| `warehouse.view` | Any scope | Read warehouses, capabilities, material settings. |
| `warehouse.manage` | Enterprise | Create/update warehouses, capability operations, material settings. |
| `inventory.view` | Any scope | Read inventory balances and the stock-movement ledger. |
| `document.view` | Any scope | Read documents: list/detail, lines, attachments, lifecycle history, policy. |
| `document.create` | Document warehouse scope | Start a new document in a warehouse scope. |
| `document.update` | Document warehouse scope | Edit Draft content (lines, petals, paper refs, attachments incl. signed copy). |
| `document.submit` | Document warehouse scope | `Draft → Submitted`. |
| `document.post` | Document warehouse scope | `Submitted → Posted` (generic) or `Draft → Posted` (adjustment); requires the signed-original gate. |
| `document.reject` | Document warehouse scope | `Submitted → Rejected` (manager review). |
| `document.revise` | Document warehouse scope | `Rejected → Draft` (restore editability). |
| `document.cancel` | Document warehouse scope | `Draft/Submitted/Rejected → Cancelled` (pre-post). |
| `document.reverse` | Document warehouse scope | `Posted → Reversed` via a compensating document; requires documented reason. |
| `count.view` | Any scope | Read count sessions, lines, variance. |
| `count.plan` | Count warehouse scope | Create a count session. |
| `count.enter` | Count warehouse scope | Enter actual quantities/variance reasons on count lines. |
| `count.complete` | Count warehouse scope | Mark the session `Completed`. |
| `count.close` | Count warehouse scope | Review variances and close (`Closed`). |
| `asset.view` | Any scope | Read asset registry/detail, derived status, movement history, custody timeline. |
| `custody.assign` | Asset warehouse scope | Assign personal custody to an employee; transfer/return custody rows. |
| `audit.view` | Any scope | Read the (redacted) audit log list and detail. |
| `report.view` | Any scope | Read dashboards/KPIs/report pages. |
| `admin.user.view` | Enterprise | Read user list/details. |
| `admin.user.manage` | Enterprise | Create/update accounts and replace role-scope assignments. |
| `admin.role.view` | Enterprise | Read roles and the permission catalog. |
| `admin.role.manage` | Enterprise | Create/update roles and grant permissions. |

Semantics notes:

- The vocabulary is open-ended by design (the session carries a string set);
  this table is the approved v1 baseline that the backend must ratify, not a
  closed list that forbids future codes. The frontend treats any code not in
  this table as follows: in guards it is unknown → never grants anything; the
  related control is hidden until the code is ratified and registered.
- Reading a document's history/policy/attachments does not require separate
  codes; it is `document.view`.
- Upload/delete of attachments is `document.update` (D-ATT-01 owns the gate
  semantics).
- Documents are type-agnostic: Receiving, Issue, Transfer, Opening, Return,
  and (with the D-ADJ-01 exception below) Adjustment share the same codes.
  No per-document-type permission is invented, keeping the authorization model
  simple and the policy layer authoritative.
- `manage` verbs on master data imply their own `view`; the UI still checks
  both when a read-only role should see a list without the manage menu.

## Scope derivation (consumption model)

The active scope on the session is the *only* scope axis: `permissionCodes`
are computed by the server for that scope (union semantics per D-AUTH-01).
Consequences the matrix relies on:

- A role granted at Enterprise scope applies to all sites/warehouses; at Site
  scope to that site's warehouses; at Warehouse scope to one warehouse. This
  realizes the Architecture Overview's "Enterprise/Site/Warehouse Manager"
  without extra roles codes — `WH_MGR` at a higher assignment scope is the
  "Enterprise WH Manager".
- Data returned by any query is further scoped by the active scope
  server-side. The frontend never filters locally to emulate scope.
- After a scope switch, the old `permissionCodes` are gone; navigation and
  guards re-evaluate from the new session (scope switch flow, D-AUTH-01).

## Route permission and scope matrix

Route constants live in `src/config/routes.ts`; this matrix defines their
guards. Guard semantics: all codes in the row must be present at the active
scope (`permissionAny` is used only where a page offers alternative entry
points, e.g., a create page that serves two doc types).

| Group / page | Route pattern (illustrative) | Required codes | Scope note |
| --- | --- | --- | --- |
| Login | `/login` | — (public) | Anonymous only. |
| Scope selection | `/session/scope` | — | Authenticated + `SelectionRequired`. |
| No access | `/session/no-access` | — | Authenticated + `Unavailable`. |
| Dashboard | `/` | `permissionAny` of the operational view codes (`document.view`/`inventory.view`/`report.view`/…) | Authenticated + scope selected. |
| Catalog admin | `/catalog/domains`, `/catalog/categories`, `/catalog/families`, `/catalog/materials`, `/catalog/units` | read: `catalog.view`; create/update writes: `catalog.manage` | Enterprise-facing pages. |
| Organization refs | `/organization/sites`, `/organization/org-units`, `/organization/employees`, `/organization/external-parties` | read: `organization.view`; writes: `organization.manage` | Enterprise-facing pages. |
| Warehouses | `/warehouses` | read: `warehouse.view`; writes: `warehouse.manage` | Enterprise-facing pages (capabilities, settings). |
| Inventory | `/inventory/balances`, `/inventory/movements` | `inventory.view` | Any scope; data scoped server-side. |
| Receiving / Issue / Transfer / Opening / Return | `/documents/receiving`, `/documents/issue`, `/documents/transfer`, `/documents/opening`, `/documents/return` (+ create/detail) | read: `document.view`; create: `document.create`; edit: `document.update`; action per D-LIFE-01 (`submit/post/reject/revise/cancel/reverse`) | Warehouse (or containing Site) scope of the doc's warehouse required by server. |
| Adjustment / Disposal | `/adjustments`, `/adjustments/new`, `/adjustments/{id}` | read: `document.view`; create/edit form: `document.create` **and** `document.post` enabled (the manager-only gate); action: `document.post`, `document.reverse` | D-ADJ-01 exception: keepers never see these routes/actions. |
| Inventory count | `/counts`, `/counts/{id}`, `/counts/new` | `count.view` (all); create: `count.plan`; entry form: `count.enter`; complete/close: `count.complete`/`count.close` | Warehouse scope. |
| Assets & custody | `/assets`, `/assets/{id}`, `/custody/pending` | `asset.view`; custody assignment/transfer: `custody.assign` | Warehouse/site scope. |
| Audit | `/audit` | `audit.view` | Typically Enterprise; server redacts (§D-AUD-02). |
| Reports | `/reports` | `report.view` | Any scope. |
| Admin users | `/admin/users`, `/admin/users/{id}` | `admin.user.view`; writes: `admin.user.manage` (incl. role-scope replacement) | Enterprise-facing. |
| Admin roles | `/admin/roles`, `/admin/roles/{id}` | `admin.role.view`; writes: `admin.role.manage` | Enterprise-facing. |

Unlisted URLs → `404`-style not-found, not a permissions experiment.

## Guard behavior

1. Guards use session state only (query-backed). Until hydration ends, show a
   neutral loading boundary (SAD §7/D-AUTH-01); no flash of the shell.
2. Not authenticated → `login` (anonymous route). Authenticated without a
   scope → `SelectionRequired` gate or `Unavailable` screen; never falls
   through to a protected page.
3. Authenticated with scope but missing the code → Arabic permission-denied
   surface ("ليست لديك صلاحية الوصول") with a link back; **this is not a
   logout** and the session stays.
4. A page that lost a permission mid-session (role change) refetches the
   session and re-evaluates; navigation item disappears, route shows the
   denial after refetch.
5. Deep links into non-permitted routes are covered: matrix is the same in
   the route registry, navigation manifest (`e07-t01`), and mobile drawer —
   three consumers, one source.

## Role seed reference (v1)

These are the reference permission sets the backend seeds (`e22-t06`
administration UI can edit them; the matrix below is the v1 baseline):

| Role code | Purpose | Permission codes |
| --- | --- | --- |
| `SYSTEM_ADMIN` | Full administration | All v1 codes. |
| `DATA_MANAGER` | Master-data steward (enterprise) | `catalog.manage`, `catalog.view`, `organization.manage`, `organization.view`, `warehouse.manage`, `warehouse.view`, `admin.user.view`, `admin.role.view` + `admin.user.manage`, `admin.role.manage`. |
| `WH_MGR` | Warehouse manager (can be granted at Warehouse, Site, or Enterprise scope) | All engine codes: `catalog.view`, `organization.view`, `warehouse.view`, `inventory.view`, `document.view/create/update/submit/post/reject/revise/cancel/reverse`, `count.view/plan/enter/complete/close`, `asset.view`, `custody.assign`, `report.view`. |
| `WH_KEEPER` | Warehouse keeper | `catalog.view`, `organization.view`, `warehouse.view`, `inventory.view`, `document.view/create/update/submit/revise/cancel`, `count.view/enter`, `asset.view`, `custody.assign`, `report.view`. |
| `AUDITOR` | Read-only auditor | `inventory.view`, `document.view`, `count.view`, `asset.view`, `audit.view`, `report.view` (+ `catalog.view`, `organization.view`, `warehouse.view` for context). |

Notes:

- A keeper's own `document.cancel` is honored for its own Draft documents;
  managers Cancel any pre-post state. Exact per-actor presentation of
  `submit/reject/post/cancel/revise/reverse` is the D-LIFE-01 server policy
  (`Hidden/Disabled/Enabled`); the codes are its permission layer.
- `WH_MGR` granted at Enterprise scope == the Architecture Overview's
  "Enterprise WH Manager"; at Site scope == "Site Manager"; at Warehouse
  scope == "Warehouse Manager". One role code, three assignment scopes —
  using D-AUTH-01 semantics instead of inventing role variants.
- Data entry roles are deliberately narrow: `DATA_MANAGER` cannot post
  documents; `WH_KEEPER` cannot post; `WH_MGR` sees no `admin.*` — default.

## Downstream frontend behavior

1. **One source of truth.** `src/config/permissions.ts` exports the typed
   `PermissionCode` union + the READ-ME comments linking to this document;
   the generated API types line up with the contract. The union is the single
   typed reference for guards, the navigation manifest, and `usePermission`.
2. **`usePermission` predicates** (`e06-t06`):
   - `has(code)`, `hasAll(codes)`, `hasAny(codes)` reading
     `permissionCodes` from the session query;
   - `useRoutePermission(route)` convenience deriving the route's guard;
   - server errors remain honest: a `403` shows the Arabic safe denial; the
     predicate never claims correctness.
3. **Navigation manifest** (`e07-t01`): derived from the same registry —
   items appear if and only if the route guard passes; no duplicated `if`
   logic in sidebar code.
4. **Action gating** uses the code + policy: for documents the server policy
   (`e04-t15`) decides `Hidden/Disabled/Enabled`, and the permission only
   pre-filters. The rule "keeper never sees Post" and "posts only after
   signed gate" are enforced by *both* layers.
5. **Adjustment route:** requires `document.create` **and** `document.post`
   so only manager-scoped users ever reach/create adjustment forms; the same
   rule re-validates in the server policy.
6. **Tests** (unit + MSW): guard behavior for every row of the matrix;
   permission denial vs login; scope-switch re-evaluation; nav gating.

## Compatibility and OpenAPI impact

- The session `permissionCodes` stay an open string array (D-AUTH-01).
- The `/admin/permissions` catalog must be seeded with exactly the v1 code
  list above (codes + `nameAr`/`descriptionAr`) — the UI rendering of the
  permission picker in role admin depends on it.
- Roles seed data: the five reference roles above (codes + permission sets) —
  documented as seed references, editable in admin UI afterwards.
- Documentation: the OpenAPI permission `example` set extended to the v1
  codes; the decision table acts as the enumeration contract for
  `e01.7` ratification. Unknown server-returned codes are tolerated (open
  set) but cannot unlock a guard they aren't mapped to.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e05-t02` | Route constants + lazy registry carry guard metadata per this matrix. |
| `e06-t05` | Protected/anonymous/scope guards implement the guard behaviors above. |
| `e06-t06` | `usePermission` predicate suite over `permissionCodes` (no role downloads). |
| `e07-t01` | Navigation manifest derives from this matrix (same source). |
| `e07-t03`/`t04` | Shell/nav/drawer consume manifest, not ad-hoc role checks. |
| `e12-t12` | Policy-gate coordinator double-checks code + policy (action-level). |
| `e22-t06` | Role administration: permission catalog + seed reference; session remains effective source. |
| `e01.7` | Ratify codes, seeds, and guard vocabulary against the backend. |
| `e24-t0x` | Integration: guard matrix, scope-switch re-eval, 403 vs 401, keepers vs managers on adjustment. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Per-resource fine codes for every list/detail | Explodes the vocab; `view` + per-verb mutation codes cover v1 scenarios. |
| Client-side "roles" gating (WH_MGR etc.) | Roles are assignments, not authorization; diverges from server authority and breaks Enterprise-scope managers. |
| Route-level permission strings embedded in page files | Duplication across routes/nav/guards; single registry source is required. |
| Downloading all role assignments to compute permissions | Rejected by D-AUTH-01; creates a second source of truth. |
| Treat every denied route as logout | D-AUTH-01: `403` ≠ `401`. |
| Per-document-type permission codes (e.g., `receiving.create`) | Invents an order-of-magnitude larger vocabulary, contradicts the shared document engine, and treats a UI section as an authorization identity. |

## Explicitly owned remaining decisions

- `permissionCodes` remain an open string array (D-AUTH-01) with the canonical
  table above as the approved baseline; converting the array to a closed enum
  is deferred to ratification.
- Backend seeds, actor-scope nuance (a keeper canceling own vs other's draft),
  and remaining .NET string parity: `e01.7` ratification.
- The exact rendering of the Arabic denial pages (copy, recovery paths):
  `e06-t05` and usability review.

Implementation does not invent codes or roles beyond this table; guards,
navigation, and actions are derived from one approved vocabulary.