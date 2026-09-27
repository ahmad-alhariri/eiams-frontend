# RBAC and scope verification

Implementation slice: `eiams-frontend-e24-t06` — *Verify RBAC and scope across all
modules*. This is a verification slice: it closes route-guard coverage, fixes the
defects that verification exposed, and records where the frontend deliberately
declines to be an authorization authority.

## Governing contracts

- **Route permission matrix** (`route-permission-scope-matrix.md`): D-RBAC-01
  through D-RBAC-03, plus §7 human decisions.
- **Single role / single scope** (`single-role-single-scope-assignment-decision.md`):
  a user holds exactly one role at exactly one assigned scope.
- **Authorization policy v1** (SYSTEM tree
  `docs/integration/rbac-authorization-policy-v1-draft.md` §3): the approved
  effective permission sets. This is the newest human decision and **supersedes**
  the role rows still present in the repository copy of the matrix.
- **Legacy → dotted mapping** (SYSTEM tree
  `docs/integration/rbac-legacy-to-dotted-mapping-v1.md`): role conversion and the
  explicit policy choices behind it.

## Authority boundary

D-RBAC-01 rejects client-side role gating outright: *roles are assignments, not
authorization*. The frontend therefore never branches on a role name. It receives
`permissionCodes` that the **server** computes for the user's single assignment and
branches only on those codes.

This is why the role sets in `src/test/rbac-role-fixture.ts` are a **test
fixture**, not production logic. They drive synthetic sessions into the real
guards and assert what the guards do. They must never be imported by application
code. D-RBAC-03 makes the same point from the scope side: scope-aware effective
permission calculation is server work, and the frontend's only visible effect is
that it *receives fewer codes*.

Frontend scope filtering is likewise a UX aid. It can only narrow rows the client
already holds, so it is not a security control — the API's scope filtering is
authoritative.

## What verification found and fixed

Three defects, all the same shape: **a control that was present in the UI but not
actually enforced**.

| # | Defect | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Live upload/remove controls on a Draft for a `document.view`-only session | `attachmentsReadOnly` in `document-detail-page.tsx` was derived from document **status** only | Also require `permitAction('UploadAttachment')`, i.e. `document.update` |
| 2 | `active-custody-list-page.tsx` called `usePermission` and discarded it via `void has` | leftover scaffolding; the page has no action UI, so the route guard (`asset.view`) is the real gate | Removed the dead import, call, and two dead `void` label suppressions |
| 3 | `custodyActive` was wired and guarded but had no navigation entry or inbound link | route added without a nav item | Added under *الأصول والتكليف*; nav items 26 → 27 |

Defect 1 is the substantive one. A user could attempt an upload and receive a
server-side 403 — precisely the "guard only in the UI is not a guard" outcome
D-RBAC-01 rule 3 rules out. The fix moves the check to where the panel's
`readOnly` flag is actually composed, and `rbac-attachment-permission.test.ts`
pins both halves of that condition so neither can regress.

## Coverage added

Before this slice the suite exercised `RouteAccessGuard` with exactly **one**
route key, leaving 58 of 59 declared routes with no allow/deny evidence at all.

| Suite | Cases | What it proves |
| --- | --- | --- |
| `rbac-route-guard-matrix.test.tsx` | 168 | Every non-public registry-wired route admits a session holding its declared codes and denies one missing a code; the rendered guard and the pure predicate agree; guard metadata is present and canonical |
| `rbac-role-separation.test.ts` | 41 | The approved role × scope sets partition routes and navigation correctly |
| `rbac-scope-isolation.test.ts` | 15 | Cache keys are namespaced per scope, a switch evicts scoped data, and a 403 surfaces as a refusal rather than an empty list |
| `rbac-attachment-permission.test.ts` | 11 | The attachment gate requires `document.update`, matching the approved role sets |
| `sidebar-nav-model.test.ts` | +1 | Every guarded list route is reachable from navigation (would have caught defect 3) |

Suite totals: **240 files / 1584 tests**, up from 236 / 1348.

Expectations are evaluated through the **production** predicates
(`hasRoutePermission`, `hasAllPermissions`, `hasAnyPermission`,
`filterSidebarNav`, `getActionPermissionCode`), never re-implementations of them,
so a suite cannot pass by restating the rules it exists to check. Where possible
the assertions are invariants rather than golden route lists: ordinary route
growth will not break them, but a real regression — a keeper gaining
`document.post`, an administrator gaining `report.view` — will.

## Policy positions now encoded as tests

| Position | Enforced assertion |
| --- | --- |
| SYSTEM_ADMIN is structural administration only | Denies `audit.view`, `report.view`, every operational ledger route, and every lifecycle action code; reaches only structural and user-management routes |
| Enterprise and Site are governance-only (D-RBAC-03) | `WH_MGR@Enterprise` and `WH_MGR@Site` hold no operate code, reach an **identical** route set, and are refused every manager-only creation route |
| Only Warehouse is operational | `WH_MGR@Warehouse` reaches a strict superset, including the create/plan routes the Site scope cannot |
| Generic document preparation is a keeper workflow | A manager holds `document.post` but **neither** `document.submit` nor `document.revise`; a keeper holds `Submit` but not `Post`/`Reject`/`Reverse` |
| Adjustment and Disposal creation is manager-only (D-ADJ-01) | Both routes require `document.view` + `document.create` + `document.post`; a keeper keeps read access to adjustment lists and details |
| Custody assignment is a keeper action | Only `WH_KEEPER` holds `custody.assign`, gating `custodyPending`, while `custodyActive` stays read-only for every role that can see assets |
| AUDITOR is read-only at every scope | Every held code ends in `.view`; no route requiring a non-view code is reachable; the audit ledger is reachable; no admin route is |
| DATA_MANAGER is deferred | Declared deferred, has no grant row, and is not silently granted anything |
| Navigation mirrors the routes | No nav item is shown to a role that cannot reach it, and none is hidden from a role that can |

### Two supersessions worth flagging

The role rows still in the repository copy of `route-permission-scope-matrix.md`
are stale relative to the approved policy. Where they disagree, this suite
encodes the **approved** position:

1. SYSTEM_ADMIN is **not** "all v1 codes" — it holds 10 structural codes at
   Enterprise only, with no `audit.view` and no `report.view`.
2. `DATA_MANAGER` is **not** one of five seeded roles — it is deferred for v1.

The stale rows should be brought into line with the approved policy; this slice
deliberately did not edit that document, since the SYSTEM tree's policy is the
governing artifact and the divergence is better resolved there.

## Manual verification

Rendered behaviour was verified in Chrome DevTools MCP against the Vite dev
server with MSW mocks enabled. Roles were simulated by narrowing `permissionCodes`
in `src/shared/services/dev-session.ts` (restored afterwards; `git diff` on that
file is empty). The fixture Draft used throughout is
`EIAMS-RCV-2024-0001` (`/documents/receiving/00000000-0000-4000-8000-000000000096`).

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `document.view`-only sees **no** attachment write controls on a Draft | **PASS** | Zero buttons, zero `input[type=file]`; المرفقات rendered as headings and descriptions only. This is the defect-1 fix. |
| 2 | Adding `document.update` restores them | **PASS** | `رفع مرفق` / `حذف المرفق` present, 2 file inputs restored |
| 3 | SYSTEM_ADMIN sees the admin group, never التدقيق or التقارير | **PASS** | Sidebar groups: الرئيسية, التصنيف والأصناف, المؤسسة, المستودعات, الإدارة. `/audit` by direct URL renders the Arabic denial — enforced, not merely hidden |
| 4 | `custodyActive` is navigable and renders | **PASS** | `العهد النشطة` appears under الأصول والتكليف with `asset.view` only; click navigates to `/custody/active` and renders the full list (row `AST-2023-C099`, status نشطة) with a correct breadcrumb |
| 5 | A Site-scope manager gets no operational control | **PASS** | On a Draft: zero buttons, zero file inputs. On the receiving list the `سند استلام جديد` button is gone. On `/counts` the list is readable but no planning button exists |
| 6 | Keeper never offered Post; manager never offered Submit or Revise | **PASS** | Keeper action bar: تعديل, إرسال للترحيل, إلغاء — no ترحيل, no عكس. Manager action bar: تعديل, إلغاء, ترحيل, عكس — no إرسال للترحيل. Bidirectional split confirmed in the rendered UI |
| 7 | A forbidden route URL renders a denial, not a blank page | **PASS** | `/documents/receiving/new` as a Site-scope manager rendered "ليست لديك صلاحية الوصول" with explanatory text and a "العودة إلى لوحة المعلومات" button |

Two additional confirmations fell out of the run:

- **Custody pending gating holds in the UI.** With `asset.view` alone the sidebar
  shows `العهد النشطة` but not `الأصول بانتظار التكليف`, which additionally
  requires `custody.assign`.
- **The defect-2 cleanup is safe.** `active-custody-list-page.tsx` renders
  correctly with the dead `usePermission` call and `void` suppressions removed.
- No console errors or warnings were emitted on the exercised pages.

### A limitation of the attachment test, stated plainly

`rbac-attachment-permission.test.ts` verifies the gate's two halves separately:
that `AttachmentPanel` honours a `readOnly` flag (covered by the existing
`attachment-panel.test.tsx`) and that the flag's composition requires
`document.update` (covered here). The composition expression itself lives inline
in `document-detail-page.tsx`, and the test **mirrors** that expression rather
than rendering the page. So the two halves are proven but the wiring between them
is asserted, not executed.

That is why check 1 above is not optional. The browser run closed the gap: a
`document.view`-only session on a Draft rendered zero attachment write controls
and zero file inputs, while adding `document.update` restored them. Wiring the
page under test into a rendered test is still a reasonable follow-up, but it
requires mocking the document/attachment transport and was out of scope for this
slice.


## Change log

- `src/shared/documents/pages/document-detail-page.tsx` — attachment gate now
  requires `document.update` in addition to a mutable status.
- `src/modules/custody/pages/active-custody-list-page.tsx` — dead permission
  scaffolding removed.
- `src/shared/layout/sidebar/sidebar-nav-model.ts` — `custodyActive` added.
