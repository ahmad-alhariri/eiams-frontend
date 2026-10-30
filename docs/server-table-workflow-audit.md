# Server table workflow audit

**Status:** Enforced by a source scan and focused component tests
**Bead:** `eiams-frontend-e25-t07`
**Date:** 2026-10-30
**Mechanism:** `src/test/server-table-workflow-audit.test.ts` plus the
`DataTableServer` / `query-keys` unit tests

## What this audit is

It hardens the workflow every large list screen shares:
`useServerPagination` → a TanStack Query list read → `DataTableServer` →
`ServerPaginationControls`. It answers four questions:

1. Does a scope switch keep the PREVIOUS scope's rows on screen?
2. Is a page change distinguishable from a first load, an empty result and an
   error?
3. Does a narrow screen scroll the table, or the whole page?
4. What happens to the page number when the server total shrinks?

## The measurement (before the change)

| Fact | Value |
| --- | --- |
| Production files scanned by the fence (gallery excluded) | 388 |
| Files containing `<DataTableServer>` | 29 |
| `<DataTableServer>` call sites | 30 (`recent-activity-panel.tsx` renders two) |
| `placeholderData: keepPreviousData` sites | 29 (across 12 hook files) |
| Paginated report queries with NO placeholder (`src/modules/reports/hooks/use-reports-queries.ts`) | 4 of the 4 paginated queries (the dashboard query is a singleton) |
| Call sites forwarding `isFetching` | **0** |
| `overflow-x-auto` scroll containers in the shared table | 1, with `min-w-0` but no `max-w-full` / `overscroll-x-contain` |
| File-scope scan offenders, run against the pre-change tree | 29 scope-blind placeholders, 30 missing `isFetching` props, missing scroll classes |

The 29 placeholder sites are the 27 request-keyed list queries listed by
`e25-t05` plus two resource-keyed queries (`warehouse capabilities`,
`all count lines`) that received the same treatment. All of them key on a
scoped key: `['scoped', kind, id, resource, ..., request]`.

The four paginated report queries had NO placeholder at all, although their
keys are scoped the same way: their services are named `get*Report`, so the
`e25-t05` list-query rule never named them. A page change in a report
therefore showed the first-load skeleton, and the refreshing state of the
table below was unreachable there.

## The defects found

### 1. Previous-scope rows rendered as the new scope's rows (data integrity)

`keepPreviousData` keeps the previous result for ANY key change. Switching the
active site or warehouse changes the scope segment of the key, so the table
asked the server for the new scope while displaying the old scope's rows under
the new scope's heading. That is not a cosmetic flash: one site's inventory can
be read as another site's.

Fix: `keepPreviousDataInSameScope(scope)` in
`src/shared/services/query-keys.ts` compares the previous query key's
`['scoped', kind, id]` prefix with the active scope and returns `undefined`
(no placeholder → skeleton) when they differ. Every one of the 29 sites now uses
it. The helper stays generic over the row type, like TanStack's own
`keepPreviousData`, so it never pins the query's data type before `queryFn` is
inferred.

The four paginated report queries joined them, because their keys are scoped
the same way (`queryKeys.scoped(scope, 'reports', …)`) and the same helper is
therefore the correct placeholder for them: it keeps the current page while
the next one loads and refuses the rows of another scope. The dashboard
report query is a singleton and has no page to keep.

### 2. A page change looked like a finished table

`DataTableServer` rendered the skeleton from `isLoading` only. TanStack Query v5
reports `isLoading` as false when placeholder rows exist, so a page change kept
the stale rows with no indication that they were about to be replaced.

Fix:

| State | Markup |
| --- | --- |
| First load | skeleton, `role="status"`, "جاري تحميل الجدول..." |
| Page change / background refetch | previous rows + `role="status"` "جارٍ تحديث البيانات...", `aria-busy="true"` on the table surface |
| Empty | `EmptyState` heading "لا توجد بيانات" |
| Error | `ErrorState` heading "حدث خطأ" + "إعادة المحاولة" |

`DataTableServer` now accepts `isFetching` (through `DataTableProps`), forwards
it to `DataTable`, and uses it for the search spinner. All 30 call sites pass
`query.isFetching`; the one client-paginated table (`count-variance-review.tsx`)
passes `false` because no request drives it.

The status region is mounted for the whole life of the table and only its TEXT
changes. A live region that appears together with its text is usually not
announced, because the screen reader was not watching it yet. `aria-busy` on
the table surface follows `isFetching`, not the banner's visibility.

The refreshing row of the table above is reachable on all 29 request-driven
call sites: every query behind them keeps the previous page while the next one
loads, the four report queries included since their placeholder was added.

### 3. Narrow screens

The shared table already scrolled inside `overflow-x-auto`, but the card could
still size to its content. The card is now `max-w-full`, the scroll container is
`min-w-0 max-w-full overflow-x-auto overscroll-x-contain`, and the server
wrapper keeps `min-w-0`. The page column (`AppLayout` main) and `ContentCard`
already had `min-w-0`. No physical `left`/`right` utility was added.

### 4. Pagination drift when the total shrinks

`useServerPagination.setPage` only clamps to `>= 1`; it does not know the server
total. After a delete or a narrower filter the view could sit on page 5 of 2 and
request rows the server no longer has. `DataTableServer` is the first layer that
sees both the current page and `totalPages`, so it now calls
`onPageChange(totalPages)` when `page > totalPages` and the total is known. The
hook deliberately keeps its narrow contract: widening it would require every
caller to own and pass a record count.

## The fence

`src/test/server-table-workflow-audit.test.ts` scans the pinned production set
(388 files; `src/test/**`, `src/contract-smoke/**` and `src/app/gallery/**`
excluded) and asserts:

| Rule | Detector | Negative control |
| --- | --- | --- |
| No scope-blind placeholder | the `placeholderData` VALUE is read brace-aware (a placeholder broken across lines is still read); the bare `keepPreviousData` identifier is banned, the scope-aware helper is not | a synthetic query using `keepPreviousData` is caught — including one broken across lines; the helper form is not |
| Every server table says it is fetching | brace-aware opening-tag scan of `<DataTableServer ...>` for `isFetching=` | a synthetic tag without it is caught; nested JSX in `emptyAction` does not fool the scanner |
| The table cannot widen the page | class tokens on the shared scroll container and server wrapper | a synthetic `w-full overflow-x-auto` container is caught, and so is a server wrapper without `min-w-0` |

## What this audit does not cover

- Layout in a real browser. The scroll rule is a class-token invariant; the
  orchestrator's browser QA is what proves it at 360px.
- The visual weight of the refresh banner, and whether every screen wants the
  same wording.
- Server totals that grow while a page is displayed: no clamp is needed, and the
  code does not pre-emptively move the page.
