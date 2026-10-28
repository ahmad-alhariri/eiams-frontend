import { useCallback, useMemo } from 'react'

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
  /**
   * The read FAILED and holds no cached rows, so `items` says NOTHING about
   * what the Issue holds: it is empty because the server never answered, not
   * because there is nothing to return. A failed read must stay
   * distinguishable from an empty one, so the caller gets its own Arabic
   * surface and a retry instead of a silently empty list.
   */
  isError: boolean
  /** Re-runs the failed read. */
  retry: () => void
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
        ? queryKeys.unscoped(RETURN_RESOURCE, 'eligible-items')
        : queryKeys.scoped(scope, RETURN_RESOURCE, 'eligible-items', originalIssueDocumentId),
    queryFn: () => returnService.listEligibleItems(originalIssueDocumentId ?? ''),
    enabled,
    staleTime: OPERATIONAL_STALE_TIME,
  })

  const { refetch } = query
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  return useMemo(
    () => ({
      items: query.data?.items ?? [],
      isLoading: query.isLoading,
      // A background refetch that fails over cached rows keeps serving them
      // (the server's last answer is still the server's answer), so the
      // failure is reported only when NOTHING is known.
      isError: query.isError && query.data === undefined,
      retry,
    }),
    [query.data, query.isError, query.isLoading, retry],
  )
}
