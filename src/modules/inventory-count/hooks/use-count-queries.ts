import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

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

/** Page size the whole-session review reads with (hbfu). */
export const COUNT_LINE_REVIEW_PAGE_SIZE = 100

/**
 * Hard ceiling on the pages a whole-session review will fan out over. Beyond
 * it the review refuses to render rather than silently truncating the
 * variance set that gates completion (hbfu: never truncate the review).
 */
export const MAX_COUNT_LINE_REVIEW_PAGES = 100

/** Derived ceiling on how many lines one review pass will load. */
export const MAX_COUNT_LINE_REVIEW_LINES = MAX_COUNT_LINE_REVIEW_PAGES * COUNT_LINE_REVIEW_PAGE_SIZE

export const countQueryKeys = {
  counts: (scope: ScopeCacheKey, query: ListInventoryCountsQuery) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'counts', query),
  count: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'count', countId),
  /** Prefix covering every page of one session's lines. */
  linesRoot: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'lines', countId),
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

export interface UseAllCountLinesResult {
  /** Every line of the session, in server page order. */
  readonly lines: readonly InventoryCountLine[]
  /** Server-reported total for the session. */
  readonly totalItems: number
  readonly isLoading: boolean
  readonly isError: boolean
  /**
   * True when the session has more pages than the review will fetch. The
   * review must block rather than show a partial variance set.
   */
  readonly isOversized: boolean
  readonly refetch: () => void
}

const EMPTY_LINES: readonly InventoryCountLine[] = []

/**
 * Every line of one count session, fanned out across its server pages (hbfu).
 *
 * The variance review and the completion gate must see the WHOLE session: a
 * gate computed from one page would let a session complete with an
 * unexplained variance hiding on page 3. The fan-out is capped, and the cap
 * surfaces `isOversized` instead of quietly returning a partial set.
 */
export function useAllCountLinesQuery(
  countId: string | undefined | null,
  pageSize: number = COUNT_LINE_REVIEW_PAGE_SIZE,
): UseAllCountLinesResult {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  const enabled = scope !== undefined && countId != null && countId !== ''

  const firstPage = useQuery({
    queryKey:
      scope === undefined || countId == null
        ? ['inventory-counts', 'lines', 'unscoped', countId, { pageIndex: 0, pageSize }]
        : countQueryKeys.lines(scope, countId, { pageIndex: 0, pageSize }),
    queryFn: () => countService.listLines(countId ?? '', { pageIndex: 0, pageSize }),
    enabled,
    staleTime: OPERATIONAL_STALE_TIME,
  })

  const totalPages = firstPage.data?.meta.totalPages ?? 1
  const isOversized = totalPages > MAX_COUNT_LINE_REVIEW_PAGES
  const remainingPageCount = Math.max(0, Math.min(totalPages, MAX_COUNT_LINE_REVIEW_PAGES) - 1)

  const remainingPages = useQueries({
    queries: enabled
      ? Array.from({ length: remainingPageCount }, (_unused, index) => ({
          queryKey: countQueryKeys.lines(scope, countId ?? '', { pageIndex: index + 1, pageSize }),
          queryFn: () => countService.listLines(countId ?? '', { pageIndex: index + 1, pageSize }),
          staleTime: OPERATIONAL_STALE_TIME,
        }))
      : [],
  })

  return useMemo<UseAllCountLinesResult>(() => {
    if (!enabled) {
      return {
        lines: EMPTY_LINES,
        totalItems: 0,
        isLoading: false,
        isError: false,
        isOversized: false,
        refetch: () => undefined,
      }
    }

    const lines: InventoryCountLine[] = [...(firstPage.data?.items ?? [])]
    for (const page of remainingPages) {
      lines.push(...(page.data?.items ?? []))
    }

    const isLoading = firstPage.isLoading || remainingPages.some((page) => page.isLoading)
    const isError = firstPage.isError || remainingPages.some((page) => page.isError)

    return {
      lines,
      totalItems: firstPage.data?.meta.totalItems ?? lines.length,
      isLoading,
      isError,
      isOversized,
      refetch: () => {
        void firstPage.refetch()
        for (const page of remainingPages) {
          void page.refetch()
        }
      },
    }
  }, [enabled, firstPage, isOversized, remainingPages])
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

/**
 * Precise invalidation for a line-entry save (hbfu): the session's line pages
 * at every page index plus its detail read. Not a blanket resource sweep — the
 * completion gate reads the whole line collection, so every page of this
 * session must be refreshed while other sessions stay cached.
 */
function useCountLinesInvalidation(countId: string) {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return () => {
    if (scope === undefined || countId === '') return
    void queryClient.invalidateQueries({ queryKey: countQueryKeys.linesRoot(scope, countId) })
    void queryClient.invalidateQueries({ queryKey: countQueryKeys.count(scope, countId) })
  }
}

/** Batches actual-quantity entry onto count lines (`count.enter`). */
export function useUpdateCountLinesMutation(countId: string) {
  const invalidate = useCountLinesInvalidation(countId)
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
