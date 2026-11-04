# EIAMS Frontend Architecture Audit and Remediation Record

**Status:** Implemented - seven slices landed, four findings withdrawn, two closed without code
**Date:** 2026-11-02
**Scope:** `eiams-frontend`, branch `feature/live-api-on-handwritten-contracts`
**Method:** a read-only audit first, then incremental implementation. Every slice was gated by typecheck, lint, the full test suite, a production build and the bundle budget, and was independently reviewed before it was accepted.

## 1. Why this file exists

The audit and its remediation ran inside review sessions. Nothing about them
landed in the repository, so the branch carried code with no record of why it
looks the way it does, and no record of the findings that were investigated and
rejected. This file is that record: the architecture as it was, the findings
with their evidence, the dead-code inventory, the target architecture, the
plan, and what actually shipped.

Every claim below names the file that proves it. Where a claim could not be
proven, it is listed as unknown rather than asserted.

## 2. The baseline the audit started from

| Gate | Result at audit time |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | 1 error: the untracked `src/test/rtl-copy-audit.test.ts` was UTF-16LE, so ESLint reported "File appears to be binary" |
| `pnpm test` | 2724 passed / 8 failed / 1 skipped (333 files) |
| `pnpm run build` | PASS |
| `pnpm run budget:bundle` | PASS (168 chunks / 1,613,293 B / 344,082 B largest) |

All eight test failures were traced to a root cause rather than a symptom:

- seven anti-drift scans pin an exact production-file count (409) and had
  drifted by exactly one file: the untracked `src/shared/utils/arabic-numbers.ts`;
- one was the error-feedback de-duplication offender inside a file another
  session was editing at that moment;
- one was an Arabic-digit assertion in that same in-flight work;
- one was the corrupt UTF-16LE file that also failed lint.

Two of them were fixed by this work (the file encoding and the digit
assertion). The rest are self-healing once the in-flight work is committed.

## 3. The architecture as it was

The frontend is a feature-oriented Vite SPA: `src/app` (shell, providers,
routing), `src/config` (route and permission metadata), `src/modules/<domain>`
(16 domains, each with `components`/`hooks`/`pages`/`schemas`/`services`/`types`),
`src/shared` (the document spine, UI kit, API transport, selectors, stores) and
`src/test` (harness, MSW, and the repo-wide anti-drift scans).

Three things were structurally sound and were deliberately left alone:

- **One transport, two layers.** `src/shared/api/api-transport.ts` is the
  `ApiTransport` interface and `src/shared/api/axios-transport.ts` is its
  Axios implementation; `src/shared/api/transport.ts` composes them. About 38
  module services import it.
- **Central permission enforcement.** Document lifecycle actions are gated by
  `ACTION_PERMISSION_CODES` in `src/shared/documents/use-document-permissions.ts`
  and rendered through `LifecycleActionBar` in
  `src/shared/documents/pages/document-detail-page.tsx:757`. Route-level gating
  lives in `src/config/routes.ts` (71 permission references). Counting
  `usePermission` call sites was the wrong measurement.
- **Handwritten wire contracts.** D-INT-02 is in force: every module service
  speaks to the API through the shared transport with per-module handwritten
  wire types. The generated OpenAPI artifact is deleted and a guard test
  (`src/test/no-new-generated-imports.test.ts`) keeps it that way.
## 4. Findings register

| ID | Severity | Finding | Evidence | Outcome |
| --- | --- | --- | --- | --- |
| F-01 | P0 | `src/shared` imported feature code, so the shared layer depended on a domain module | `src/shared/documents/document-header-form.tsx:5,18`, `src/shared/documents/document-policy-gates.ts:1`, `src/shared/selectors/adapters/warehouse-selector.ts:1` | FIXED: warehouse wire types moved to `src/shared/types/warehouse.wire-types.ts`; the selector and the capability validator are injected at the page seam |
| F-02 | P1 | A posted document invalidated only its own detail key, so balances, stock movements, assets and the document lists stayed stale | `src/shared/documents/use-document-lifecycle-actions.ts:181-197` | FIXED: the mutation now calls `invalidateScopedQueries(queryClient, activeScopeCacheKey)` (`src/shared/services/query-keys.ts:62`), which covers the whole active scope |
| F-03 | P1 | The cache-resource vocabulary was scattered; one module (adjustment) imported constants from seven other modules purely to invalidate their caches | `src/modules/adjustment/hooks/use-adjustment-queries.ts:5-11` | FIXED: one `RESOURCES` registry in `src/shared/services/query-keys.ts`; every module keeps its exported constant name and derives it from the registry |
| F-04 | P1 | Two module-level import cycles | `src/modules/auth/services/session-display.ts:1` to `src/modules/admin/types/role.types.ts`, `src/modules/admin/hooks/use-admin-mutations.ts:5` to `src/modules/auth/services/session-lifecycle`; `src/modules/organization/components/counterpart-select.tsx:9` to `src/modules/issue/schemas/issue-info.schema` | FIXED: the scope vocabulary moved to `src/shared/types/scope.types.ts` (the admin module file is now a re-export shim), and the counterpart select types its own union instead of importing the issue module's |
| F-05 | P1 | Two dependencies were never imported, and one type assertion was redundant | zero library imports of `react-pdf` / `@react-pdf/renderer` anywhere in `src/`; `src/shared/api/axios-transport.ts:85` | FIXED: both packages removed with `pnpm remove`; the assertion dropped because `unwrapData` already infers the element type |
| F-06 | P2 | Six form dialogs each carried the same submit-and-map-errors block | `catalog/material-form-dialog.tsx`, `catalog/material-category-form-dialog.tsx`, `catalog/unit-of-measure-form-dialog.tsx`, `organization/organizational-unit-form-dialog.tsx`, `organization/site-form-dialog.tsx`, `warehouse/warehouse-form-dialog.tsx` | FIXED: `submitWithServerErrors` in `src/shared/forms/server-errors.ts`; each dialog keeps its own field allow-list, because a dialog that shows a field as a note has no form field to carry that error |
| F-07 | P3 | The Arabic RTL copy fence named by `docs/rtl-copy-audit.md` was a stub: one assertion, no detectors | `src/test/rtl-copy-audit.test.ts` (334 bytes, UTF-16LE) | FIXED: a real fence with ten tests over the pinned production set, a synthetic control file (`src/test/fixtures/rtl-copy-audit-control.tsx`), and the two production digit fixes it found |
| F-08 | P2 | Three oversized shared components | `src/shared/documents/attachment-panel.tsx` (623 lines), `document-policy-gates.ts` (530), `document-header-form.tsx` (468) | CLOSED WITHOUT CODE: the policy gates are a pure rules module with no React, and the attachment panel is one cohesive surface already decomposed into six internal components. Splitting them would scatter cohesive code for line count alone |
| F-09 | P2 | Two modules do not follow the module skeleton | `opening` (pages only), `transfer` (no services or types) | CLOSED WITHOUT CODE: both are thin compositions over the shared document spine, so a service or type layer would be scaffolding with nothing to hold |
| F-10 | P2 | Shared code still imports feature code | type-only: none left outside the sanctioned auth shim - the two document line editors had still imported `CapabilityOperation`, `Material` and `MaterialUnitConversion` from their owning modules until 2026-11-02, when they were repointed to `src/shared/types/warehouse.wire-types.ts` and `src/shared/types/catalog.wire-types.ts`; runtime: `src/shared/documents/components/asset-line-editor.tsx:5,9`, `src/shared/documents/components/quantity-line-editor.tsx:9-12,16`, `src/shared/documents/pages/document-detail-page.tsx:7` | PARTLY FIXED: every type-only edge is gone - the line editors were the last three, so the earlier claim was premature. `Uuid` and `RecordStatus` are declared once in `src/shared/types/wire-primitives.ts`, the catalog wire types live in `src/shared/types/catalog.wire-types.ts`, the four feature-specific selector adapters moved to their owning modules, the status badge owns its adjustment status union, and the export button moved to the reports module. The runtime edges stay OPEN as `eiams-frontend-zhg2` |

## 5. Dead code and unused elements

| Category | File / symbol | Evidence | Classification | Action | Risk |
| --- | --- | --- | --- | --- | --- |
| Dependency | `react-pdf`, `@react-pdf/renderer` | zero library imports in `src/`; every "PDF" hit is user-visible copy (`src/app/gallery/gallery-sections.tsx:54`, `src/shared/feedback/file-dropzone.tsx:59`) | VERIFIED_UNUSED | removed with `pnpm remove`; the lockfile lost 611 lines | MEDIUM, and now closed: the build and the full suite passed after removal |
| Component | `src/shared/ui/radio-group.tsx` | imported only by its own test (`src/shared/ui/selection-primitives.test.tsx:15`); the `RadioGroup` used elsewhere comes from `@base-ui/react` (`src/shared/ui/dropdown-menu.tsx:134`) | VERIFIED_UNUSED | **deleted** (batch B1) | LOW |
| Test file | `src/shared/ui/action-text-entry-primitives.test.tsx` | the name matches no component; the file tests Button, Input and Textarea | VERIFIED_UNUSED (mislabel) | candidate for rename, not done here | LOW |
| Service | `src/shared/services/api.client.ts` | imported only by `src/contract-smoke/*` and one app-router test; no production module imports it | TEST-ONLY | keep: it is the contract-smoke harness | LOW |
| Dependency | `msw` | every import sits under `src/test/` | TEST-ONLY | keep | LOW |
| Page | `src/app/gallery/gallery-page.tsx` | `src/config/route-registry.tsx:18` plus `app.test.tsx`, `app-router.test.tsx` and `src/test/production-artifact-purity.test.ts:42` | REQUIRED | keep: dev-only route, still wired | none |
| Transport | `src/shared/api/api-transport.ts`, `axios-transport.ts` | about 38 module services plus the shared document transport import them | REQUIRED | keep | none |

A claim that several module pages (asset, inventory, transfer, opening, audit)
were dead was investigated and disproved: every one of them is routed in
`src/config/route-registry.tsx:60-102` and imported by the integration tests.
## 6. Code-quality findings

| Finding | Where | Severity | State |
| --- | --- | --- | --- |
| The submit-and-map-errors block was copied into six dialogs | the six form dialogs | P2 | FIXED (F-06) |
| Cache-key vocabulary was mirrored per module and imported across module boundaries | 22 query-hook files | P1 | FIXED (F-03) |
| Module-level import cycles | auth/admin, organization/issue | P1 | FIXED (F-04) |
| Two type assertions in shared infrastructure | `src/shared/api/axios-transport.ts:85`, `src/shared/services/query.client.ts:23,25` | P2 | One removed as redundant; the two in `query.client.ts` are deliberate defensive probes of an `unknown` error at a trust boundary and were kept, because replacing them needs a type-guard abstraction with no runtime benefit |
| Per-module ad-hoc date and number formatting next to the shared helpers | module pages and schemas against `src/shared/utils/format.ts` and `arabic-numbers.ts` | P3 | OPEN, mostly a consequence of the in-flight Arabic-digit work; the shared fence now prevents new divergence |
| Arabic error copy is produced by two overlapping paths | `src/shared/api/error-copy-ar.ts` and `src/shared/services/api-error.ts` | P3 | OPEN: consolidating them is a pure copy-moving change with no behaviour difference, and it is better done when the error-code backlog (section 9) is worked |
| Silent query errors beside the toast path | `src/shared/services/query.client.ts` next to the toast manager | P3 | OPEN and deliberately not changed: changing when an error surfaces is observable behaviour |

## 7. Target architecture and dependency boundaries

The proposed layout in the original brief (`src/app`, `src/features/<domain>`,
`src/shared`) is **illustrative only**. The repository already has an
equivalent, domain-oriented layout (`src/modules/<domain>`) with a working
`src/shared`, and a repo-wide reshuffle would move every file for no
architectural gain. What follows is the set of boundaries that matter, stated
as rules the current layout can satisfy without moving anything.

1. **`src/shared` never imports a feature module.** The one sanctioned
   exception is `src/shared/documents/active-scope.ts`, a single-point re-export
   of the auth module's active-scope hook; auth is treated as infrastructure.
2. **A feature does not import another feature's internals.** Cross-feature
   needs go through a shared contract, a shared hook, or a page seam.
3. **A wire contract that the shared spine genuinely needs lives in
   `src/shared/types`.** This is a narrow, deliberate extraction (the warehouse
   and scope vocabularies), not a global type registry. Feature-specific types
   stay in their feature.
4. **A shared component that needs a feature's runtime is bound at the page
   seam.** The page (which belongs to the feature) supplies the hook; the
   shared component receives it as an optional prop with an explicit unbound
   fallback. `document-header-form.tsx`, `document-list-page.tsx` and
   `use-document-policy-gate.ts` follow this pattern.
5. **Server state lives only in TanStack Query, UI state only in Zustand.**
6. **One cache vocabulary.** `RESOURCES` in `src/shared/services/query-keys.ts`
   owns every resource string; a module keeps its exported constant name as an
   alias, so no caller has to change.

## 8. Findings that were withdrawn

Investigated, found wrong, and dropped. They are listed so nobody re-raises
them.

| Withdrawn finding | Why it was wrong |
| --- | --- |
| "The transport layer is duplicated or dead" | `api-transport.ts` is the interface, `axios-transport.ts` the implementation, and `transport.ts` composes them; about 38 module services import it. Only `api.client.ts` is test-only |
| "`src/shared/api` imports `modules/admin`" | no such import exists |
| "Seven modules have no permission gates" | lifecycle actions are gated centrally (`use-document-permissions.ts` -> `LifecycleActionBar`), routes carry 71 permission references, and asset, audit and inventory are read-only modules with nothing to gate |
| "Several module pages are dead code" | all of them are routed and imported by the integration tests |

## 9. What is still open

| Item | Why it is not code we can simply write |
| --- | --- |
| The remaining shared-to-feature runtime edges (F-10) | three files, eight runtime edges: the two document line editors and the detail page (the catalog material selector, the warehouse capability validation, the catalog material-unit-conversion query, and the material-kind label/policy vocabulary in the quantity editor). Rule 4 (bind at the page seam) covers the selector and the capability validator; the per-row conversion query cannot be injected as a prop without rewriting the row data flow, so its read contract has to move to `src/shared/api` with the catalog module depending on it. It is the one slice that can still change document behaviour, so it is tracked separately as `eiams-frontend-zhg2` |
| `eiams-frontend-z1hs`: the error-copy table covers 86 of 382 backend error codes | bounded data work, not a defect; `docs/error-copy-ar-backlog.md` already holds the backlog |
| The dashboard route is still a placeholder | needs a product decision on what the dashboard shows; the KPI semantics decision exists but the scope is not settled |
| The org-unit route, the auth session lifecycle items, the inventory split | need contract or product decisions that are not ours to make |
| The four open P0 governance epics | decision-record ratification and contract-baseline conformance; they are ratification work, not implementation |

## 10. What shipped, and how it was verified

| Slice | Change | Verification |
| --- | --- | --- |
| F-01 | shared-to-module dependency direction | typecheck, lint, full suite, build, budget; independent review approved with no blocking findings |
| F-02 | scope-wide invalidation on document lifecycle | plus a regression test that seeds a scoped list key and a scoped inventory key and asserts both are invalidated after a post |
| F-03 | the `RESOURCES` registry | all fifteen resource strings proved byte-equal to their previous values |
| F-04 | the two import cycles | the Arabic scope labels proved byte-equal to their previous values |
| F-05 | unused dependencies and the redundant assertion | `pnpm remove` plus a clean build and full suite |
| F-06 | one shared submit and error-mapping path | four new tests in `src/shared/forms/server-errors.test.tsx` |
| F-07 | the RTL copy fence | ten tests, including a synthetic control per detector |

Final state of the branch: `pnpm run typecheck` clean, `pnpm run lint` clean
(no errors at all; the UTF-16LE file was rewritten as UTF-8 without a BOM),
`pnpm test` 2761 passed / 1 skipped with zero failures, `pnpm run build` clean,
and `pnpm run budget:bundle` inside the re-derived ceilings (169 chunks,
1,615,035 B measured against a 1,615,445 B ceiling, largest chunk 344,750 B,
route count unchanged at 59).

**Note (post-2026-11-02):** later commits re-derived the bundle ceilings; the
current authoritative figures live in `src/config/bundle-budget.json` and read the
JSON's append-only `note` field for every re-derivation since
2026-10-30. This audit's own figures are internally consistent as of its date
(2026-11-02); no revision of the audit's findings is intended.

Commits: `01b0919` (the five architecture slices, the RTL fence and the
in-flight Arabic-digit work that shared files with them), `df60767` (the beads
tracker sync) and `22a911d` (the shared submit path).