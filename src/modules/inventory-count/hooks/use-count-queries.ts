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
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

const COUNT_RESOURCE = 'inventory-counts'
const ALL_COUNT_LINES_PAGE_SIZE = 200

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
  allLines: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'lines', countId, 'all'),
}

/**
 * Reads every page of one count snapshot before publishing any lines. A
 * count-linked adjustment must never be seeded from a partial page: later
 * variance lines carry the same material/asset provenance as the first page.
 */
async function listAllCountLines(countId: string): Promise<readonly InventoryCountLine[]> {
  const firstPage = await countService.listLines(countId, {
    pageIndex: 0,
    pageSize: ALL_COUNT_LINES_PAGE_SIZE,
  })
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, (_, index) =>
      countService.listLines(countId, {
        pageIndex: index + 1,
        pageSize: ALL_COUNT_LINES_PAGE_SIZE,
      }),
    ),
  )

  return [
    ...firstPage.items,
    ...remainingPages.flatMap((page) => page.items),
  ] satisfies readonly InventoryCountLine[]
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

/**
 * Complete count-line snapshot for variance review and adjustment seeding.
 * TanStack Query publishes the aggregate only after every advertised server
 * page succeeds, so consumers cannot mistake a partial response for the full
 * count.
 */
export function useAllCountLinesQuery(countId: string | undefined | null) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined || countId == null
        ? ['inventory-counts', 'lines', 'all', 'unscoped', countId]
        : countQueryKeys.allLines(scope, countId),
    queryFn: () => listAllCountLines(countId ?? ''),
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
/**
 * Saves the batch of changed count lines.
 *
 * There is deliberately **no `onError` invalidation** here, and that absence is
 * load-bearing rather than an oversight. The quantity-entry workspace feeds the
 * loaded page to react-hook-form through the `values` prop, and react-hook-form
 * treats a deep-unequal `values` change as a full reset. Invalidating on the
 * error path would therefore reload the lines — including on a `409`, which is
 * the case where keeping the operator's work matters most — and silently
 * discard every quantity they had typed, immediately after the toast told them
 * to try again.
 *
 * A `409` is surfaced instead through `isConflictError(error)` at the call
 * boundary, which hands it to `useCountConflictRecovery`. That refetches the
 * authoritative count and lines only when the operator explicitly asks for the
 * newer version. The save is never retried automatically: this operation
 * accepts no `Idempotency-Key` (unlike its `/start`, `/complete` and `/close`
 * siblings), so a retry cannot be made safe, and
 * `docs/feature-service-composition-standard.md:90-91` forbids it.
 */
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
