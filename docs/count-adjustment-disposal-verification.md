# Count, adjustment, and disposal verification

Implementation slice: `eiams-frontend-e24-t05`.

## Governing contracts

- [Adjustment workflow](adjustment-workflow-decision.md): manager-owned Draft → Posted → Reversed, with terminal disposal and a required signed original.
- [Route permission matrix](route-permission-scope-matrix.md): creation requires document view/create/post; lifecycle actions use their own post/reverse permissions.
- [Count freeze policy](inventory-count-freeze-policy-decision.md): SoftFreeze is advisory; completing a count does not itself change stock.
- [Asset event contract](return-asset-movement-event-contract-decision.md): disposal of an issued asset does not deduct stock again; the API owns custody closure and terminal status.

## Implementation

`ROUTE_METADATA` is the single source of the adjustment/disposal creation gate.
The list links, count launch, and draft forms reuse `useRoutePermission`.
`AdjustmentActionBar` combines action-specific permissions with server policy;
it never presents reversal for disposal.

The disposal form captures the selected asset's `material.id` separately from
`assetId`. Both identifiers reset when the warehouse changes. Free text does
not create a selection. Its shared `AsyncSelect` loader sends every debounced
search with the selected `warehouseId` to the authoritative eligible-assets
endpoint, so an asset is not hidden merely because it falls beyond an
unfiltered first page. Draft mutations disable inputs while pending, preserve
values on failure, and use the existing normalized Arabic toast feedback.
Lookup and count-seed failures provide Arabic recovery feedback.

Count variance review and count-linked adjustment seeding use one TanStack
Query-owned aggregate that follows the line endpoint's `totalPages`. No line is
published until every advertised page succeeds, preventing a later nonzero
variance from being silently omitted.

The `kc7v` lifecycle correction shares count eligibility and line classification
through `inventory-count/utils/count-review.ts`. Unentered actual quantities
are neither matching lines nor shortages; completion remains unavailable until
actual quantities are entered (PRD §12.6), retaining the existing per-variance
reason gate. Entered lines display the contract's read-only `difference`
without recalculation. No client-derived balance or adjustment variance is used.

Adjustment launch requires a Completed or Closed session, as specified by
`kc7v`, plus the existing manager permissions; a known zero `varianceCount`
hides the launch. The destination independently checks the fetched lifecycle
and all count lines. Incomplete and zero-variance seeds show Arabic recovery
instead of mounting an unusable locked form. The fetched count supplies the
warehouse identity and label, regardless of an altered URL warehouse parameter.
Malformed purpose/count links are rejected. Server state/scope validation
remains authoritative; these UI guards do not prove backend enforcement.

All production reads and writes continue through existing domain services and
TanStack Query hooks. Form values stay in React Hook Form with Zod validation.
There is no new dependency, endpoint, server-state store, or client-side ledger.
Existing shared inputs, buttons, cards, selectors, attachments, and error
components preserve the Arabic RTL design.
The adjustment detail grid uses a shrinkable single column so wide line tables
scroll inside their own container instead of overflowing the mobile page.

## Automated evidence

| Test surface | Behavior exercised |
| --- | --- |
| `src/test/count-adjustment-disposal-chain.test.tsx` | Completed count → seeded draft → post; inventory balance and movement refetch; count/document/line/material provenance; signed-original block; permission reevaluation; seed retry; both disposal stock cases; asset/custody/history cache refresh; terminal read-only UI. |
| `asset-disposal-form-page.test.tsx` | Keeper denial, real selection required, warehouse-scoped server search (including a match beyond the first 50), exact material/asset request mapping, one line at −1, no count reference, duplicate-submit prevention, warehouse reset, and recoverable lookup/save failures. |
| Count variance and adjustment draft tests | Complete page aggregation with 201 lines, including a nonzero variance returned only on page two; later-page failure hides partial data and supports retry. |
| `kc7v` review, launch, and draft regressions | Null/omitted actual quantities, server-owned difference, completion guard, Planned/InProgress direct-link denial, Completed/Closed eligibility, zero-variance and incomplete seed feedback, and authoritative warehouse mapping on save. |
| `src/mocks/handlers.test.ts` | Development disposal search filters before pagination; a matching asset after 50 unfiltered rows is returned and the warehouse constraint remains effective. |
| Route, launch, list, draft, detail, and action-bar tests | Metadata/CTA agreement, realistic keeper create-without-post permissions, and independent post/reverse permissions. |
| `cross-module-scenarios.test.ts` | Shared document and adjustment projections reference the same signed originals. |

The integration tests mount real pages, services, and query observers.
MSW serves explicit typed before/after projections. It does not implement a
backend transaction or prove backend RBAC, custody-event ordering, atomicity,
or stock enforcement. Exact IDs remain contract identities, not inferred links.

## Validation

Run `pnpm run quality` for contract-generation freshness, lint, typecheck,
formatting, tests, and production build. Focused checks:

```sh
pnpm run test src/test/count-adjustment-disposal-chain.test.tsx src/modules/adjustment --maxWorkers=2
```

Browser QA is separate evidence: inspect Arabic desktop/tablet/mobile layout,
keyboard selection, draft validation/save, and terminal disposal display with
development MSW data. Do not interpret development mocks as a live backend.
Final run outcomes and browser evidence are recorded on the Bead.

Independent browser checks covered desktop (1440), tablet (768), and mobile
(390), Arabic validation, count-linked context, warehouse-change clearing, and
the exact disposal POST payload. A temporary fixture entry exercised the real
route guard and detail page for keeper denial, missing signed original, and
posted terminal disposal; that entry was removed after QA. The mobile overflow
regression was corrected and rechecked: document width 375/375, with the 520px
table scrolling only inside its 276px container.

The `foth` follow-up was checked against the current worktree on port 5185.
Browser network evidence confirmed `pageIndex=0`, `pageSize=10`, `search=P02`,
and the selected warehouse ID on the eligible-assets request. The updated
development mock returned only the matching printer and displayed the Arabic
empty message for a nonmatching query. RTL document width stayed within the
1440/768/390 viewports (1425/753/390 content widths), with no current-server
console warnings or errors. The independent QA agent confirmed initial RTL
render and disabled-before-warehouse behavior; its extended CDP checks were
interrupted, so request/search/responsive evidence was completed by the primary
agent. Stale servers on other ports were not treated as product evidence.

Independent `kc7v` browser QA on port 5185 confirmed three unentered lines
without artificial shortages, disabled completion, no premature launch, and
Arabic direct-link rejection with working pointer navigation back to the count.
Entering/saving all actuals enabled completion: a zero-variance Completed count
had no launch; a nonzero Completed count launched the locked, correctly seeded
draft. Desktop/tablet/mobile (1440/768/390) remained RTL with no document overflow;
the mobile quantity table scrolled within its container. Warning/error logs
were empty. Completed and Closed launch eligibility are also automated tests.

The return link passes a Testing Library Tab/Enter navigation regression.
Browser key injection focused but did not activate either that native link or
an unchanged sidebar link, so native-browser keyboard activation remains an
automation limitation, not claimed as verified or worked around in app code.

Final `kc7v` validation: the full Vitest run passed 233 files / 1,292 tests;
the subsequently added Tab/Enter regression passed in the final 18-test draft
page run. Typecheck, format check, generated API freshness, production build,
and changed-file lint with zero warnings passed. Repository lint retains the
five existing `j90m` warnings; the build retains its existing mock/browser
chunk-size warning. Self-review and the UI detector found no remaining issue
in the lifecycle correction. The separate quantity-entry gap below prevents
closing the wider cross-module task.

## Known follow-up work

- `eiams-frontend-hbfu`: the existing quantity-entry workspace requests only
  page zero (200 lines) and has no page navigation. Operators cannot enter later
  unentered lines; the cross-module `e24-t05` stays open pending this follow-up.
- `eiams-frontend-j90m`: five existing lint warnings in untouched files.
- `eiams-frontend-e24-t06`: broader cross-module RBAC and scope verification.
- `eiams-frontend-e24-t09`: concurrency resilience and partial-failure verification.
