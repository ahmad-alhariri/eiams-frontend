import { useCallback } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { useCounterpartSelector } from '@/modules/organization/selectors/counterpart-selector'
import { counterpartLookupService } from '@/modules/organization/services/counterpart-lookup.service'
import type {
  CounterpartReference,
  CounterpartSearchOptions,
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

function createWriteSearchQuery(
  search: string,
  options: CounterpartSearchOptions,
): SearchCounterpartsQuery {
  return {
    // List endpoints are 0-based; write lookups always read the first page.
    pageIndex: 0,
    pageSize: WRITE_PAGE_SIZE,
    search,
    ...(options.type === undefined ? {} : { type: options.type }),
    ...(options.siteId === undefined ? {} : { siteId: options.siteId }),
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
    queryFn: () => counterpartLookupService.searchCounterparts(query ?? { search: '' }),
    enabled: scope !== undefined && query !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

/** Resolves current and inactive entities for document, custody, and audit history. */
export function useHistoricalCounterpartQuery(reference: CounterpartReference | undefined) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  return useQuery({
    queryKey:
      scope === undefined || reference === undefined
        ? queryKeys.public(COUNTERPART_RESOURCE, 'resolve', reference)
        : counterpartLookupQueryKeys.resolve(scope, reference),
    queryFn: () =>
      counterpartLookupService.resolveCounterpart(reference ?? { type: 'Employee', id: '' }),
    enabled: scope !== undefined && reference !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

/**
 * Supplies a stable AsyncSelect loader for new Issue/Custody write choices.
 * `fetchQuery` makes the remote results TanStack Query-owned while retaining
 * AsyncSelect's debounced, request-per-search interaction model.
 */
export function useActiveCounterpartOptions(options: CounterpartSearchOptions = {}) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const queryClient = useQueryClient()
  const loadCounterparts = useCallback(
    async (search: string) => {
      if (scope === undefined) {
        return []
      }

      const query = createWriteSearchQuery(search, options)
      const page = await queryClient.fetchQuery({
        queryKey: counterpartLookupQueryKeys.search(scope, query),
        queryFn: () => counterpartLookupService.searchCounterparts(query),
        staleTime: MASTER_DATA_STALE_TIME,
      })

      return page.items.filter((counterpart) => counterpart.status === 'Active')
    },
    [options, queryClient, scope],
  )

  return useCounterpartSelector(loadCounterparts)
}
