import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
  type InventoryCountPlanRequest,
  type ListInventoryCountsQuery,
  type UpdateCountLinesRequest,
} from '@/modules/inventory-count/types/inventory-count.types'
import { countService } from '@/modules/inventory-count/services/count.service'
import { createIdempotencyKey } from '@/shared/services/mutation-safety'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const COUNT_RESOURCE = 'inventory-counts'

export const countQueryKeys = {
  counts: (scope: ScopeCacheKey, query: ListInventoryCountsQuery) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'counts', query),
  count: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'count', countId),
  lines: (
    scope: ScopeCacheKey,
    countId: string,
    query: { pageIndex?: number; pageSize?: number; search?: string },
  ) => queryKeys.scoped(scope, COUNT_RESOURCE, 'lines', countId, query),
}

export {
  INVENTORY_COUNT_STATUS_LABELS_AR as COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR as COUNT_TYPE_LABELS_AR,
}

/**
 * Shared invalidation for every count mutation: the touched count's detail
 * and lines plus the session list (status transitions move rows between
 * filters).
 */
function useCountInvalidation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext()
  return () => {
    if (scope.activeScopeCacheKey === undefined) return
    // Every count query is scoped under [scoped, ...scopeParts, inventory-counts, ...].
    const prefix = [
      'scoped',
      scope.activeScopeCacheKey.kind,
      'id' in scope.activeScopeCacheKey ? scope.activeScopeCacheKey.id : null,
      COUNT_RESOURCE,
    ] as const
    void queryClient.invalidateQueries({ queryKey: [...prefix] })
  }
}

/**
 * Paged count sessions for the active scope (e20-t01). Operational data —
 * 30s stale time per the architecture's stale-time policy.
 */
export function useInventoryCountsQuery(query: ListInventoryCountsQuery) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? ['inventory-counts', 'unscoped', query]
        : countQueryKeys.counts(scope.activeScopeCacheKey, query),
    queryFn: () => countService.listCounts(query),
    enabled: scope.activeScopeCacheKey !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Single count session with its lifecycle state. */
export function useInventoryCountQuery(countId: string | undefined | null) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined || countId == null
        ? ['inventory-counts', 'count', 'unscoped', countId]
        : countQueryKeys.count(scope, countId),
    queryFn: () => countService.getCount(countId ?? ''),
    enabled: scope !== undefined && countId != null && countId !== '',
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Paged count lines (snapshot vs actual vs difference). */
export function useCountLinesQuery(
  countId: string | undefined | null,
  query: { pageIndex?: number; pageSize?: number; search?: string } = {},
) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined || countId == null
        ? ['inventory-counts', 'lines', 'unscoped', countId, query]
        : countQueryKeys.lines(scope, countId, query),
    queryFn: () => countService.listLines(countId ?? '', query),
    enabled: scope !== undefined && countId != null && countId !== '',
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Plans a new count session (`count.plan`). Navigates on success at the page. */
export function usePlanCountMutation() {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (request: InventoryCountPlanRequest) =>
      countService.planCount(request, createIdempotencyKey()),
    onSuccess: invalidate,
  })
}

/** Starts a Planned session, capturing the balance snapshot. */
export function useStartCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (rowVersion: number) => countService.startCount(countId, rowVersion),
    onSuccess: invalidate,
  })
}

/** Batches actual-quantity entry onto count lines (`count.enter`). */
export function useUpdateCountLinesMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (request: UpdateCountLinesRequest) => countService.updateLines(countId, request),
    onSuccess: invalidate,
  })
}

/** Marks the session Completed (`count.complete`, idempotent). */
export function useCompleteCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (rowVersion: number) =>
      countService.completeCount(countId, rowVersion, createIdempotencyKey()),
    onSuccess: invalidate,
  })
}

/** Closes the session after variance review (`count.close`). */
export function useCloseCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (rowVersion: number) => countService.closeCount(countId, rowVersion),
    onSuccess: invalidate,
  })
}
