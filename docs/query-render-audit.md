# Query and render behaviour audit

**Status:** Enforced by a source scan
**Bead:** `eiams-frontend-e25-t05`
**Date:** 2026-10-29

## What this audit is

It asks two questions about every query in the application:

1. Is the cache window one the shared query client recognises, or an arbitrary
   number somebody typed?
2. When the query key changes - because the page or the filters changed -
   does the user keep seeing the rows they had, or does the table blank?

Both are answered by a source scan (`src/test/query-render-audit.test.ts`)
rather than by eye, because a rule nobody checks is a rule that decays.

## The measurement

| Fact | Value |
| --- | --- |
| Production source files scanned | 409 |
| `staleTime` overrides using a NAMED policy constant | 76 |
| `staleTime` overrides using `Number.POSITIVE_INFINITY` (session-scoped) | 3 |
| `staleTime` overrides using an ARBITRARY number | **0** |
| `placeholderData` / `keepPreviousData` before this audit | **0** |
| Request-keyed list queries without a placeholder | **27** (across 11 files) |

The three `Number.POSITIVE_INFINITY` overrides are the session queries
(`use-active-scope-context.ts`, `use-cached-session.ts`,
`use-session-hydration.ts`): a session must never go stale. That is a
deliberate exception to the named-policy rule and the rule allows it.

## The defect that was found

Twenty-seven list queries key on the request object that carries the page:

```ts
useQuery({
  queryKey: custodyQueryKeys.custodies(scope.activeScopeCacheKey, query),
  queryFn: () => custodyService.listCustodies(query),
  ...
})
```

When the page changes, the key changes. In TanStack Query v5 a key change drops
`data` and `isPending` becomes true again, so `isLoading` flips back to true -
and `src/shared/ui/data-table-server.tsx` renders its loading state on
`isLoading` (line 111) and is blind to `isFetching`. The table therefore
BLANKED on every page change and the rows the user was reading disappeared
until the next response arrived.

## The fix

Every one of the twenty-seven request-keyed list queries now sets

```ts
placeholderData: keepPreviousData,
```

so the previous page's rows stay on screen while the next page loads. The
import comes from `@tanstack/react-query` (TanStack v5 exports
`keepPreviousData`).

This was deliberately NOT set as a client-level default. A default would keep
the previous SCOPE's rows visible when the active scope changes, which in a
multi-warehouse system is worse than a blank table.

### Known limitation

`keepPreviousData` keeps the previous rows for the duration of one request
whatever changed the key, including the scope. The audit does not solve the
scope case; a scope-aware placeholder (one that compares the scope segment of
the previous key with the current scope) is the correct follow-up.

## Two readings the audit corrected

- **The row-scan query is deliberately excluded.**
  `use-custody-row-query.ts` walks pages inside its `queryFn` to find one row;
  its key is `['row', custodyId]` and never changes with the page. Giving it
  `keepPreviousData` would be wrong - it would mask a refetch of the same key
  with a stale row.
- **The first two censuses under-counted.** A fourteen-line window around the
  query key found two sites; a forty-line window found thirty-five, most of
  them a neighbouring query's page token. The audit extracts each query's OWN
  balanced-brace options object (with string literals blanked with spaces of
  the same length, so the indices still line up) and looks for the page token
  inside it. That is what makes the twenty-seven number real.

## What this audit does not cover

- Render performance in a real browser: the audit reads the source, it does not
  profile a running application.
- Whether a stale window is the RIGHT window for a given screen - it only
  checks that the window is one the shared policy defines.
- The keyboard and screen-reader behaviour of every screen, which
  `eiams-frontend-e25-t02` covers.