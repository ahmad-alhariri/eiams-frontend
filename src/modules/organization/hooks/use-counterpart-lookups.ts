import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCounterpartSelector } from '@/modules/organization/selectors/counterpart-selector'
import { counterpartLookupService } from '@/modules/organization/services/counterpart-lookup.service'
import type {
  CounterpartOperation,
  CounterpartReference,
  CounterpartResolution,
  CounterpartSearchOptions,
  CounterpartType,
  SearchCounterpartsQuery,
} from '@/modules/organization/types/counterpart-lookup.types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const COUNTERPART_RESOURCE = 'counterparts'
const WRITE_PAGE_SIZE = 10

export const counterpartLookupQueryKeys = {
  search: (scope: ScopeCacheKey, query: SearchCounterpartsQuery) =>
    queryKeys.scoped(scope, COUNTERPART_RESOURCE, 'search', query),
  resolve: (scope: ScopeCacheKey, reference: CounterpartReference) =>
    queryKeys.scoped(scope, COUNTERPART_RESOURCE, 'resolve', reference.type, reference.id),
}

/**
 * Compose the wire-shaped search query.
 *
 * `operation` is required by `GetCounterpartsQueryValidator`; the caller must
 * pick the operation (Receiving/Issue/Transfer/Return). `type` is optional —
 * the validator permits a `null` `type` and the UI re-queries when the user
 * switches recipient types. `page` is one-based per D-INT-02; we always start
 * at page 1 because the write selector reads one batch and discards the rest.
 */
function createWriteSearchQuery(
  search: string,
  operation: CounterpartOperation,
  type?: CounterpartType,
): SearchCounterpartsQuery {
  return {
    search,
    operation,
    ...(type === undefined ? {} : { type }),
    page: 1,
    pageSize: WRITE_PAGE_SIZE,
  }
}

/** Fetches active server-scoped results for callers that render their own UI. */
export function useCounterpartSearchQuery(query: SearchCounterpartsQuery | undefined) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  return useQuery({
    queryKey:
      scope === undefined || query === undefined
        ? queryKeys.public(COUNTERPART_RESOURCE, 'search', query)
        : counterpartLookupQueryKeys.search(scope, query),
    queryFn: () =>
      counterpartLookupService.searchCounterparts(query ?? { operation: 'Receiving', search: '' }),
    enabled: scope !== undefined && query !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

/** Resolves a single counterpart reference by type + id for historical lookups. */
export function useHistoricalCounterpartQuery(reference: CounterpartReference | undefined) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  return useQuery({
    queryKey:
      scope === undefined || reference === undefined
        ? queryKeys.public(COUNTERPART_RESOURCE, 'resolve', reference)
        : counterpartLookupQueryKeys.resolve(scope, reference),
    queryFn: () =>
      counterpartLookupService.resolveCounterpart(reference ?? { type: 'Employee', id: '' }),
    enabled: scope !== undefined && reference !== undefined && reference.id !== '',
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

/**
 * Supplies a stable AsyncSelect loader for new Issue/Custody write choices.
 *
 * `operation` + `type` are required by `GetCounterpartsQueryValidator`. The
 * backend's `SearchActiveAsync` already filters to Active records, so the
 * `page.filter((cp) => cp.status === 'Active')` retention is redundant but
 * cheap insurance against a server-side regression and keeps the selector's
 * `disabled` guard coherent with the visible options.
 *
 * `fetchQuery` makes the remote results TanStack Query-owned while retaining
 * AsyncSelect's debounced, request-per-search interaction model. The query
 * key is keyed by (operation, type, search) so the cache is shared across
 * surfaces that share the same parameters.
 */
export function useActiveCounterpartOptions(options: CounterpartSearchOptions) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const queryClient = useQueryClient()
  const loadCounterparts = useCallback(
    async (search: string): Promise<readonly CounterpartResolution[]> => {
      if (scope === undefined) return []
      const query = createWriteSearchQuery(search, options.operation, options.type)
      const items = await queryClient.fetchQuery({
        queryKey: counterpartLookupQueryKeys.search(scope, query),
        queryFn: () => counterpartLookupService.searchCounterparts(query),
        staleTime: MASTER_DATA_STALE_TIME,
      })
      return items.filter((cp) => cp.status === 'Active')
    },
    [options.operation, options.type, queryClient, scope],
  )
  return useCounterpartSelector(async (search: string) => {
    const items = await loadCounterparts(search)
    return [...items]
  })
}
