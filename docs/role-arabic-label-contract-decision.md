# EIAMS Role Arabic Label Contract Decision

**Status:** Approved backend contract amendment (deviation from ratified text, recorded)
**Decision ID:** D-RBAC-03
**Version:** 1.0.0
**Beads:** `eiams-frontend-vxcb` (Tranche A), `eiams-frontend-718b`
**Decision date:** 2026-10-04
**Ratified by:** Human Owner, 2026-10-04

## Decision

`Role.nameAr` is a **required** field on the backend role contract. It is added
to the role entity, to both role read projections, to the session role DTO, and
to the role create/update request bodies.

The approved shape after this decision:

| Surface | Field | Required | Notes |
| --- | --- | --- | --- |
| `Domain.Roles.Role` | `NameAr` (column `name_ar`, `varchar(200)`) | yes | `ck_roles_name_ar_not_blank` |
| `GET /admin/roles` → `RoleResponse` | `nameAr` | yes | list and detail projections |
| `GET /admin/roles/{roleId}` → `RoleResponse` | `nameAr` | yes | same DTO shape as the list |
| `POST /admin/roles` → request body | `nameAr` | yes | absent ⇒ `400 REQUEST_VALIDATION_FAILED` |
| `PUT /admin/roles/{roleId}` → request body | `nameAr` | yes | absent ⇒ `400 REQUEST_VALIDATION_FAILED` |
| `UserSessionRoleDto` (`GET /auth/session`) | `nameAr` | yes | alongside `id`, `name`, `description` |

`Role.Name` keeps its existing meaning and is **not** a display label. It is the
stable role code (`WH_MGR`, `SYSTEM_ADMIN`, …) and remains the value used for
identity, uniqueness, and assignment. `nameAr` is what the Arabic-first UI
renders.

Seed values for the four built-in roles:

| `Name` | `NameAr` |
| --- | --- |
| `SYSTEM_ADMIN` | مدير النظام |
| `WH_KEEPER` | أمين المستودع |
| `WH_MGR` | مدير المستودع |
| `AUDITOR` | مدقق |

## Why this deviates from ratified text

This decision was taken with the ratified register in view and knowingly departs
from two clauses. Recording the departure is the point of this document.

| Ratified clause | Conflict |
| --- | --- |
| RESOLUTION-027 §15 — "Role reads expose stable role ID, name, description, allowed scope types, dotted `permissionCodes`, and aggregate `rowVersion`." | The enumerated Role read fields do not include `nameAr`. |
| RESOLUTION-019 §14 — "A future multilingual model requires an explicit localization contract rather than implying one through `nameAr` alone." | This adds localization for Role as `name` + `nameAr` only, which is the shape §14 warns against. |

The accepted rationale:

1. RESOLUTION-019's neutral-single-`name` rule exists because `name` is a
   free-text human label that may already contain Arabic. That rationale does
   not transfer to `Role`: `Role.Name` is an occupied **code** field, so there
   is no free-text label for the UI to render.
2. RESOLUTION-027 §15 enumerates the read projection as it stood before the
   Arabic-first requirement was reconciled against it; the enumeration is not
   stated as a closed set, and adding a required display label is additive.
3. The scope is narrow and bounded: one additive required field, its
   projections, and the two request bodies. No existing field is renamed,
   removed, or retyped.

This decision therefore does **not** establish a general multilingual model and
does **not** license `nameAr` on other aggregates. A future true localization
contract remains governed by RESOLUTION-019 §14 and must be decided on its own
merits.

## Consequences the Owner accepted

- **Breaking change.** A client that omits `nameAr` on role create/update gets
  `400 REQUEST_VALIDATION_FAILED` instead of a successful write. The frontend
  must send `nameAr` on the role write path.
- **Session contract change.** `UserSessionRoleDto` gains a required field, so
  every session consumer and mock must supply it.
- **Existing data.** Roles created before this migration receive their role code
  as the `name_ar` value — a visible placeholder, not a translation. An
  administrator must give them a real Arabic label. The database refuses a
  blank label, so the gap cannot be silent.
- **Not a substitute for Tranche B/C.** Optimistic concurrency on the role write
  path (RESOLUTION-027 §18) and `allowedScopeTypes` widening policy remain open
  and are tracked separately under `eiams-frontend-vxcb`.

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Render the role code in the Arabic UI | An Arabic-first product showing `WH_KEEPER` where a role name belongs is a visible quality defect. |
| Frontend-side code→Arabic dictionary | Hides missing server data, drifts the moment an administrator creates a custom role, and cannot cover roles the frontend has never seen. |
| Full localization contract (`name` + `nameAr` + `nameEn`) now | RESOLUTION-027 does not call for it and no second language is in scope; building it would be speculative. Reconsider when a second language is actually required. |
| Optional `nameAr` with a code fallback | Makes the field silently absent, which is exactly the class of defect that the frontend's own contract guards exist to prevent. |

## Affected beads

| Bead | Required outcome |
| --- | --- |
| `eiams-frontend-vxcb` Tranche A | Backend `Role.NameAr`, projections, session DTO, migration, seed, validators, regenerated contract. **Done 2026-10-04.** |
| `eiams-frontend-54oi` | FE Role read path adopts `Role{id,name,nameAr,description?,allowedScopeTypes[],permissionCodes[],rowVersion}`. |
| `eiams-frontend-k1ea` | FE role write path sends `nameAr`, `expectedRowVersion`, and the separated `permissionCodes` on the replacement endpoint. `createRole` now returns the role, not an id. |
| `eiams-frontend-0lkm` | Session projection consumes `role.nameAr`. |
| `eiams-frontend-718b` | Tranche A (`nameAr`) and Tranche B (`rowVersion`/409) done. Tranche C (`allowedScopeTypes` widening policy) still needs an owner ruling. |
| `eiams-frontend-xguk` | Tranche D: §15/§16/§17/§20/§21/§23 done backend-side 2026-10-05. **Frontend half done 2026-10-05** — separate metadata and permission mutations, `permissionCodes` in the projection, scope-incompatibility refusal, `createRole` consuming the 201 projection, and Arabic copy for all three new codes. |
| `eiams-frontend-sdxn` | Tranche C (`allowedScopeTypes` widening policy) **ruled and implemented 2026-10-05**: seeded roles' scope types are fixed at creation; non-seeded roles stay editable. Backend guard + Arabic copy + tests. |
| `eiams-frontend-z1hs` | Error-copy table must key on the **UPPER_SNAKE_CASE** wire form (`ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES`, `ROLES_ROW_VERSION_MISMATCH`, …), and cannot name a missing required field because that surfaces as `details.body`. |

## Verification evidence (2026-10-04)

- `dotnet build src/Web.Api` — 0 errors, 0 warnings.
- `Application.UnitTests` — 609 passed, 0 failed (5 new tests cover
  `NameAr` requiredness and the column maximum on create and update).
- `ArchitectureTests` — 26 passed.
- `IntegrationTests` — 723 passed; the 13 failures are pre-existing and
  unrelated (bash/`psql`-dependent release scripts, plus
  `Phase0BaselineSafetyTests` asserting on `OrganizationalUnit` scope-cutover
  SQL that predates this change).
- Migration `20261004144601_AddRoleNameAr` applied against the local dev
  database that already contained a pre-existing non-seed role: the backfill
  filled it with the role code, and `ck_roles_name_ar_not_blank` rejected a
  whitespace-only label on insert.
- `contracts/openapi/eiams-backend-v1.openapi.json` regenerated; the diff is
  exactly the six `nameAr` additions and no incidental drift. Provenance
  fingerprint and coverage counts refreshed.

---

# Addendum: role permission contract (Tranche D, 2026-10-05)

Ratified by the Owner on 2026-10-05. Closes RESOLUTION-027 §15, §16, §17, §20,
§21 and §23. §22 was already satisfied and was **not** re-implemented.

## The final role contract

One projection, `Application.Roles.RoleResponse`, on every read and every write
result:

| Field | Meaning |
| --- | --- |
| `id`, `name`, `nameAr`, `description` | As Tranche A/B |
| `allowedScopeTypes` | Scopes the role may be assigned at |
| `permissionCodes` | The role's complete dotted grant set |
| `rowVersion` | **One** aggregate version shared by metadata and permissions |

`name` remains the role code, not a display label.

## Four owner rulings

**1. `permissionCodes` on both list and detail reads, as §15 says.** Measured
against the live database: 29 permissions, maximum 17 grants on any role, ~400
bytes per role, default page 20 and maximum 100. Detail-only was rejected because
it forces one request per row, which `conflict-resolution.md:2498` forbids.

**2. The one-at-a-time write endpoints are retired.** `POST
/admin/roles/{roleId}/permissions` and `DELETE
/admin/roles/{roleId}/permissions/{permissionId}` are deleted; `PUT
/admin/roles/{roleId}/permissions` replaces them. `GET .../permissions` is kept
because §23 retires writes, not reads. No consumer existed: the frontend never
called them, it folded `permissionCodes` into the metadata `PUT`, which the live
backend rejects.

**3. Scope-incompatible codes are rejected, not warned about.** Replacement is
all-or-nothing. A code whose allowed scope types do not overlap the role's
`allowedScopeTypes` is refused with
`ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES` before anything is written.
Justification: 20 of the 29 catalog permissions are valid at exactly one scope,
so an inert grant is one mis-click away, and an inert grant is indistinguishable
from a working one in the audit trail, in the admin UI, and in the user's
effective permissions. Rejecting is the only outcome where the system cannot
quietly disagree with itself.

**4. §17's exception is ratified.** Role creation returns `201 Created` with the
full `RoleResponse` instead of `ResourceIdResponse`. Role plus grants form one
atomic unit, so the create result *is* the aggregate. **Roles are therefore the
only create in the API that does not answer with `{id}`, and the only one that
answers `201`.** This is deliberate. A later reader must not "fix" it as an
inconsistency.

## Corrections to earlier reasoning

Two claims made during the Tranche A/B analysis were wrong and are corrected here
rather than left standing:

- The permission catalog was described as `{id, code, description}` with no scope
  types, on the basis of a stale published schema. It does expose
  `allowedScopeTypes`. Ruling 3 is unaffected — its justification is the silent
  inert grant, not the absence of a warning affordance — but the "accept and warn
  is not implementable" argument was factually wrong and must not be cited.
- Role grants were described as unaudited. They are audited generically and
  per-row by `AuditSaveChangesInterceptor`, with `RolePermission` registered
  against the `Role` aggregate, inside the same transaction. §21's grant/revoke
  diff therefore needed no new audit machinery, and none was added.

## Verification (2026-10-05)

- `dotnet build src/Web.Api` — 0 errors, 0 warnings.
- `Application.UnitTests` — 623 passed, 0 failed (8 new: the scope-compatibility
  gate, all-or-nothing rejection, empty-set-is-valid, duplicate/blank handling).
- `ArchitectureTests` — 26 passed.
- `IntegrationTests` — 737 passed; 13 failures pre-existing and unrelated
  (bash/`psql` release scripts, `Phase0BaselineSafetyTests`). One additional
  intermittent failure, `BackgroundWorkerSafetyTests`, passes in isolation and is
  load-sensitive; it is untouched by this work.
- `dotnet ef migrations has-pending-model-changes` — clean. No schema change was
  required; `permissionCodes` is derived from existing tables.
- Contract regenerated: 134 → **133** paths and 172 → **171** operations (the
  retired `DELETE` disappears and `POST` becomes `PUT` on the same path),
  `RoleResponse` requires `permissionCodes`, the catalog `PermissionResponse`
  gains `allowedScopeTypes`, and `POST /admin/roles` documents `201`.

---

# Addendum 2: Arabic permission catalogue (Tranche E, 2026-10-05)

A fifth gap, found only by attempting the frontend work.

## What was wrong

`role-permission-matrix-field.tsx` renders `permission.nameAr` as the primary
label of every row, but the catalogue returned `{id, code, description,
allowedScopeTypes}` — no `nameAr`, no `descriptionAr`. Against the live backend
**every permission row rendered an empty label** with only its Latin code beneath
it. This was pre-existing breakage.

`docs/route-permission-scope-matrix.md:227` already required the catalogue to
carry `nameAr`/`descriptionAr`, noting the permission picker depends on it. The
backend side was never implemented.

## What shipped

`Permission.NameAr` is required (max 200) with `ck_permissions_name_ar_not_blank`;
`DescriptionAr` is optional (max 500). Both catalogue projections expose them.
All 29 dotted codes have Arabic labels and descriptions.

The labels were aligned to the vocabulary the Arabic UI already uses — `السند`
for document, `ترحيل` for post, `مراجعة` for revise, `عكس` for reverse — rather
than inventing a parallel register.

## Two latent defects fixed at the root

**The seed claimed rows the database had deliberately deleted.**
`CutoverToDottedOnlyPermissionVocabulary` deleted all 38 colon-code permissions
with raw SQL, and its `Down` states they are intentionally not recreated — yet
`PermissionConfiguration` still seeded them. The model asserted 67 permissions
while the database held 29, so **any future `InsertData` against `permissions`
would have resurrected codes the cutover deliberately removed.** They are now
removed from the seed, which also makes the model/database agreement enforceable
going forward. `PermissionCodeMapping` retains the legacy-to-dotted history that
audit and remediation rely on.

**A column default that violated its own check constraint.** `AddColumn` left
`name_ar` with `DEFAULT ''`, which `ck_permissions_name_ar_not_blank` rejects. Any
direct insert omitting the column failed with a confusing check violation rather
than a clear not-null error. The default is dropped at the end of the migration so
omission is an explicit, obvious failure.

## Verification (2026-10-05)

- Build 0 errors / 0 warnings; `Application.UnitTests` 623/623; `ArchitectureTests` 26/26.
- `IntegrationTests` 743 passed, 13 pre-existing unrelated failures.
- 4 new wire tests assert the labels contain **real Arabic script**, not merely a
  non-empty string — the empty label was the defect, so a length check would not
  have caught it.
- Migration applied to the dev database; all 29 Arabic labels confirmed present.
---

# Addendum 3: Tranche C - seeded role scope types are immutable (2026-10-05)

Owner ruling, 2026-10-05, resolving `eiams-frontend-sdxn`.

## The hole

Any caller holding `roles.manage` could widen a seeded role's `allowedScopeTypes` -
for example taking Warehouse Keeper from `['Warehouse']` to include `Enterprise` - and
break the invariant the seed encodes. That is privilege escalation, not an editing
convenience, and it was reachable through the ordinary metadata `PUT`.

Note the pre-existing guard was partial: `UpdateRoleCommandHandler` refused *any*
modification to the Administrator role alone (`Roles.BuiltInRoleImmutable`), while the
other three seeded roles - Warehouse Keeper, Warehouse Manager, Auditor - had no
protection at all. The escalation was therefore one role code away from being noticed.

## The ruling

`allowedScopeTypes` is **fixed at creation for seeded roles** and remains editable for
roles the system did not ship. `WellKnownRoles.IsSeeded` is the single predicate.

## Two decisions inside that

**Reported as a conflict, not a validation error.** `Roles.SeededRoleScopeTypesImmutable`
is 409. The request is well-formed and would be accepted for any other role; what is
refused is the privilege it grants, not its shape.

**Compared against the stored set, not rejected as a field.** The role form always
submits `allowedScopeTypes`. Had the guard rejected any submission, renaming a seeded
role would have broken, because the client cannot tell an escalation attempt from a
round-trip of the current scopes. The handler therefore reads the persisted set and
refuses only an actual change. `Handle_Should_AcceptResubmittingTheExistingScopeTypes_OnASeededRole`
pins that, because the alternative - a guard that quietly breaks renaming - is the more
likely regression.

## Verification (2026-10-05)

- `dotnet build src/Web.Api` - 0 errors, 0 warnings. (A stale `Web.Api` process was
  holding `Application.dll` and had to be stopped first; unrelated to this change.)
- `Application.UnitTests` - 625 passed, 0 failed (was 623; +2 for the guard).
- `ArchitectureTests` - 26 passed.
- `IntegrationTests --filter Role` - 35 passed, 0 failed.
- Frontend: `tsc -b` exit 0; `eslint .` 0 errors; `prettier --check src` clean;
  `modules/admin` + `shared/api` 13 files / 79 tests passed.
- Arabic copy added for `ROLES_SEEDED_ROLE_SCOPE_TYPES_IMMUTABLE`, with a test that
  fails if it ever regresses to the generic per-status fallback.

## Not implemented, deliberately

There is still **no role create or edit form in the frontend** - `useCreateRoleMutation`
and `useUpdateRoleMetadataMutation` exist but have no calling UI. So nothing yet has to
grey out the scope-type control for a seeded role. When that form is built it must render
those scopes read-only for seeded roles rather than relying on the backend to reject the
save; the backend guard is the enforcement, not the affordance.