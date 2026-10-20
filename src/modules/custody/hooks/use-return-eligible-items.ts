import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { returnService } from '@/modules/custody/services/return.service'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'

export const RETURN_RESOURCE = 'return'

export interface UseReturnEligibleItemsResult {
  /** All returnable allocations of the selected original Issue. */
  items: readonly ReturnEligibleItem[]
  isLoading: boolean
}

/**
 * Scoped eligible-items read for the Return draft (FIX-R2): one query per
 * selected original Issue, enabled only while an issue is actually selected —
 * the per-line asset selector filters clients by `materialId`, so the page
 * fetches once rather than per line.
 */
export function useReturnEligibleItems(
  originalIssueDocumentId: string | undefined,
): UseReturnEligibleItemsResult {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const enabled = scope !== undefined && originalIssueDocumentId !== undefined

  const query = useQuery({
    queryKey:
      scope === undefined || originalIssueDocumentId === undefined
        ? queryKeys.public(RETURN_RESOURCE, 'eligible-items')
        : queryKeys.scoped(
            scope,
            RETURN_RESOURCE,
            'eligible-items',
            originalIssueDocumentId,
          ),
    queryFn: () => returnService.listEligibleItems(originalIssueDocumentId ?? ''),
    enabled,
    staleTime: OPERATIONAL_STALE_TIME,
  })

  return useMemo(
    () => ({
      items: query.data?.items ?? [],
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading],
  )
}
