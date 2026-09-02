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

The required active scope on the session is the *only* scope axis:
`permissionCodes` are computed by the server for that scope. D-SRS-01 gives a
user one persistent role-scope assignment, so the session does not offer a
client scope choice. Consequences the matrix relies on:

- A role granted at Enterprise scope applies to all sites/warehouses; at Site
  scope to that site's warehouses; at Warehouse scope to one warehouse. This
  realizes the Architecture Overview's "Enterprise/Site/Warehouse Manager"
  without extra roles codes — `WH_MGR` at a higher assignment scope is the
  "Enterprise WH Manager". This is effective hierarchy coverage, not multiple
  assignments.
- Data returned by any query is further scoped by the active scope
  server-side. The frontend never filters locally to emulate scope.
- After a server-reported assignment change or invalidation, old
  `permissionCodes` are discarded and navigation/guards re-evaluate from the
  returned session.

## Route permission and scope matrix

Route constants live in `src/config/routes.ts`; this matrix defines their
guards. Guard semantics: all codes in the row must be present at the active
scope (`permissionAny` is used only where a page offers alternative entry
points, e.g., a create page that serves two doc types).

| Group / page | Route pattern (illustrative) | Required codes | Scope note |
| --- | --- | --- | --- |
| Login | `/login` | — (public) | Anonymous only. |
| No access | `/session/no-access` | — | Authenticated + the sole assignment is `Unavailable`. |
| Dashboard | `/` | `permissionAny` of the operational view codes (`document.view`/`inventory.view`/`report.view`/…) | Authenticated + required active scope. |
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
2. Not authenticated → `login` (anonymous route). An authenticated session
   whose sole assignment is `Unavailable` renders the no-access screen and
   never falls through to a protected page. V1 has no scope-selection gate.
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
  scope == "Warehouse Manager". One role code is assignable at one of three
  scope levels; each user receives exactly one such assignment (D-SRS-01).
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

## Addendum — Enterprise scope is oversight only (D-RBAC-02, ratified e01.9)

**Status:** Ratified
**Decision ID:** D-RBAC-02
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01.9`
**Decision date:** 2026-09-02

### Decision

DECISION (current v1): The Enterprise scope (المؤسسة) is ORGANIZATIONAL and SUPERVISORY only. It confers GOVERN oversight (monitor all sites/warehouses, dashboards, movement-following, statistics) and STRUCTURAL authority (decides the org structure), but NO inventory OPERATE permission and NO approval gate in the transaction path. Routine and exception transactions occur ONLY at Site/Warehouse scope by WH_MGR. Structural creation of sites/warehouses/users/roles is executed by SYSTEM_ADMIN on the enterprise director's authority (separate user per the single-role/single-scope rule, D-SRS-01). The director approves nothing today; he observes and organizes.

PERMISSION AXES (foundation for future): OPERATE (receive/issue/transfer/post/count), GOVERN (view_all/view_reports), APPROVE (future, see D-APP-01), ADMIN (structural, SYSTEM_ADMIN only). v1 uses OPERATE + GOVERN.

RATIONALE: A government oversight authority must not place a single identity who both authorizes the org AND posts inventory; separation of duties is preserved by keeping the enterprise director as a pure observer-governor. This corrects the earlier 'one role code, three scopes' simplification in route-permission-scope-matrix.md: the Enterprise scope of WH_MGR is governance, not a super-operator.

SUPERSEDES: the loose reading of D-RBAC-01's 'one role code, three assignment scopes' as implying enterprise = wider operator. Assignment cardinality still single-role/single-scope per D-SRS-01.

AFFECTED: docs/route-permission-scope-matrix.md (add Enterprise=oversight note); permission mapping (e24-t06); no code change required in v1.

### Permission axes (v1)

| Axis | Meaning | Scopes that may hold it in v1 |
| --- | --- | --- |
| OPERATE | receive / issue / transfer / post / count | Site scope, Warehouse scope (WH_MGR, WH_KEEPER subset) |
| GOVERN | view_all / view_reports / dashboards / movement-following / statistics | Enterprise scope, Site scope, Warehouse scope |
| APPROVE | future transaction-path approval gate | Reserved for D-APP-01 (no scope grants it in v1) |
| ADMIN | structural authority: create/update sites, warehouses, users, roles | Enterprise scope — SYSTEM_ADMIN only (separate user, D-SRS-01) |

In v1 the Enterprise scope of WH_MGR grants GOVERN only; the Site and Warehouse scopes of WH_MGR grant OPERATE + GOVERN. ADMIN is held by SYSTEM_ADMIN at the Enterprise structural level and never co-located with an OPERATE role. APPROVE is not granted to any v1 scope; the transaction path is `Draft → Submitted → Posted` per D-LIFE-01 with the signed-original gate (D-ATT-01) and is not a separate approval step in v1.

### Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Reading D-RBAC-01's "one role code, three assignment scopes" as Enterprise = wider operator (i.e., Enterprise WH_MGR inherits all Site + Warehouse operations) | Conflates scope cardinality with permission widening; lets a single identity both authorize the org and post inventory, breaking separation of duties. The Enterprise scope is governance, not a super-operator. |
| Letting the enterprise director approve exception transactions directly | Adds an approval gate (APPROVE axis) to v1 that the contract does not model and that conflicts with D-APP-01's deferral. The director observes and organizes; WH_MGR at Site/Warehouse scope owns the transaction path. |
| Co-locating SYSTEM_ADMIN on the same user identity as an OPERATE role | Mixes structural ADMIN with inventory OPERATE on one identity, violating the single-role/single-scope rule (D-SRS-01) and the separation-of-duties rationale above. |

### Affected Beads

- `e24-t06` — Verify RBAC and scope across all modules (consumes the Enterprise-oversight semantics as a verification check).
- `e06-t06` — `usePermission` predicates (the predicate surface reads `permissionCodes`; the axes table above is the vocabulary the predicate composes against).

### Supersedes

- The loose reading of D-RBAC-01's "one role code, three assignment scopes" as implying Enterprise = wider operator. The original D-RBAC-01 content above is **not** modified; this addendum only tightens the Enterprise-scope semantics. Assignment cardinality (single-role/single-scope) remains as defined by D-SRS-01.

D-RBAC-02 introduces no new permission codes and no new artifacts; it narrows the meaning of the existing Enterprise-scope grant. v1 implements OPERATE + GOVERN; APPROVE is reserved for D-APP-01 (future); ADMIN is structural and held by SYSTEM_ADMIN only.

## Addendum — Warehouse is a separation-of-duties boundary (D-WH-01, ratified e01.11)

**Status:** Approved frontend and provisional API contract decision
**Decision ID:** D-WH-01
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01.11`
**Decision date:** 2026-09-02

### Decision

A Warehouse entity represents a **separation-of-duties boundary**, not a
physical building.

**INTERPRETATION A (functionally separated stores):** Where a location
separates duties across functional stores (e.g. central HQ: عامة /
معلوماتية / آليات in separate stores), model MULTIPLE Warehouse records,
each with its own capability matrix and its own scoped manager/keeper.
Scope separates the managers; capability is the per-warehouse operational
constraint.

**INTERPRETATION B (single responsible manager):** Where a branch operates
as ONE store under ONE responsible manager for ALL materials (one room,
all domains, no domain-specific keepers), model ONE Warehouse record whose
capability matrix covers all applicable domains. Scope + per-warehouse
capability fully express this with no new concept.

### Interpretation table

| Interpretation | When it applies | Warehouse records | Manager/keeper scoping | Capability matrix |
| --- | --- | --- | --- | --- |
| A — functionally separated stores | A location splits duties across distinct functional stores (e.g. central HQ: عامة / معلوماتية / آليات). | MULTIPLE Warehouse records, one per store. | Each warehouse has its own scoped manager/keeper. | Each warehouse has its own capability matrix scoped to its store. |
| B — single responsible manager | A branch operates as ONE store under ONE responsible manager for ALL materials (one room, all domains, no domain-specific keepers). | ONE Warehouse record. | One scoped manager covers the warehouse. | Capability matrix covers all applicable domains for the warehouse. |

### Governing rule

> A single-Warehouse record (Interpretation B) must NEVER be paired with
> multiple domain-specific keepers scoped to it — that combination cannot
> be separated by scope (one warehouse) or by warehouse-level capability
> (which permits all domains), and would require a net-new per-user
> material-domain restriction that is **out of scope for v1**. If duties
> later split inside a single warehouse, the warehouse must be divided
> per Interpretation A (see D-WH-02).

### Rationale

Matches the organization's real duty boundaries; central HQ keeps strict
separation (3 records, 3 scoped managers) while small branches stay
simple (1 record, 1 manager). No per-user domain restriction needed in
v1.

### Rejected alternative

| Alternative | Reason rejected |
| --- | --- |
| Per-user material-domain restriction (keep one Warehouse while allowing multiple domain-specific keepers scoped to it) | Out of scope for v1; would require a net-new authorization concept that conflicts with D-SRS-01 (one persistent role-scope per user) and D-RBAC-01 (warehouse-level capability, not per-user domain restriction). Use Interpretation A (split into multiple warehouses) instead. |

### Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e10-t09` | Warehouse setup guidance (admin UI) documents the A/B choice per location; the data model is unchanged. |
| `e24-t06` | Permission mapping integration verifies the per-warehouse capability matrix flows into the session's `permissionCodes` for the chosen interpretation. |

### Future work

Warehouse reorganization when duties split inside a single warehouse is
document-driven; see D-WH-02 (`eiams-frontend-e01.12`) for the
reorganization pattern.

### Cross-references

- D-WH-01 is recorded in the `Decisions published after baseline` table
  of `docs/requirements-conflict-matrix.md` (rows: `eiams-frontend-e01.11`
  self, `e10-t09`, `e24-t06`, `e01.12` future).
- The BDM "Warehouse and availability" row in
  `docs/business-domain-model-v1.md` cross-refs D-WH-01 for the A/B
  interpretation that governs how capability + scope express duty
  boundaries.
