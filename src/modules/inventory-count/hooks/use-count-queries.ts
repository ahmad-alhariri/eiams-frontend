import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
} from '@/modules/inventory-count/types/inventory-count.types'
import type {
  CancelCountRequest,
  CountStatus,
  InventoryCountLine,
  ListCountLinesQuery,
  ListCountsQuery,
  PlanCountRequest,
  ResourceId,
  SetLineVarianceReasonRequest,
  UpdateCountLinesRequest,
  UpdateFreezePolicyRequest,
} from '@/modules/inventory-count/types/inventory-count.types'
import { countService } from '@/modules/inventory-count/services/count.service'
import { createIdempotencyKey, type IdempotencyKey } from '@/shared/services/mutation-safety'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

export const COUNT_RESOURCE = 'inventory-counts'
// The server caps a page at PaginationDefaults.MaximumPageSize (100); asking for
// more answers 400 and the variance review never loads.
const ALL_COUNT_LINES_PAGE_SIZE = 100

export const countQueryKeys = {
  counts: (scope: ScopeCacheKey, query: ListCountsQuery) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'counts', query),
  count: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'count', countId),
  lines: (scope: ScopeCacheKey, countId: string, query: ListCountLinesQuery) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'lines', countId, query),
  allLines: (scope: ScopeCacheKey, countId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'lines', countId, 'all'),
  freezeStatus: (scope: ScopeCacheKey, warehouseId: string) =>
    queryKeys.scoped(scope, COUNT_RESOURCE, 'freeze-status', warehouseId),
}

export {
  INVENTORY_COUNT_STATUS_LABELS_AR as COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR as COUNT_TYPE_LABELS_AR,
}

/**
 * Reads every page of one count snapshot before publishing any lines. A
 * count-linked adjustment must never be seeded from a partial page. Pages are
 * ONE-based on the wire (`page`, `pageSize`).
 */
async function listAllCountLines(countId: string): Promise<readonly InventoryCountLine[]> {
  const firstPage = await countService.listLines(countId, {
    page: 1,
    pageSize: ALL_COUNT_LINES_PAGE_SIZE,
  })
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
      countService.listLines(countId, {
        page: index + 2,
        pageSize: ALL_COUNT_LINES_PAGE_SIZE,
      }),
    ),
  )

  return [
    ...firstPage.items,
    ...remainingPages.flatMap((page) => page.items),
  ] satisfies readonly InventoryCountLine[]
}

/**
 * Shared invalidation for every count mutation: the touched count's detail
 * and lines plus the session list (status transitions move rows between
 * filters), and the freeze-status reads.
 */
function useCountInvalidation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext()
  return () => {
    if (scope.activeScopeCacheKey === undefined) return
    // Built by the shared factory rather than by hand. A hand-derived prefix
    // can silently diverge from `queryKeys.scoped`'s shape and then match
    // nothing at all, which is the failure filed as eiams-frontend-jkel.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(scope.activeScopeCacheKey, COUNT_RESOURCE),
    })
  }
}

/**
 * Paged count sessions for the active scope. `warehouseId` is OPTIONAL in the
 * query — omitted reads every count in the caller's scope (F4, cross-warehouse
 * list). 30s stale time per the operational-data policy.
 */
export function useInventoryCountsQuery(query: ListCountsQuery) {
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

/** Single count session with summary + settlement. */
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

/** Paged count lines (snapshot vs actual vs server difference). 1-based page. */
export function useCountLinesQuery(
  countId: string | undefined | null,
  query: ListCountLinesQuery = {},
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

/**
 * The warehouse freeze advisory (`GET
 * /warehouses/{warehouseId}/inventory-freeze-status`). Enabled by the caller:
 * the planning form asks while a warehouse is picked, the detail page while a
 * count is InProgress (F9).
 */
export function useWarehouseFreezeStatusQuery(
  warehouseId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined || warehouseId === undefined
        ? ['inventory-counts', 'freeze-status', 'unscoped', warehouseId]
        : countQueryKeys.freezeStatus(scope.activeScopeCacheKey, warehouseId),
    queryFn: () => countService.getFreezeStatus(warehouseId ?? ''),
    enabled:
      (options.enabled !== undefined ? options.enabled : scope.activeScopeCacheKey !== undefined) &&
      warehouseId !== undefined &&
      warehouseId !== '',
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Plans a new count session (`count.plan`). Returns the 201 `{ id }`; the page
 * navigates to the detail where the session is refetched.
 *
 * The idempotency key is minted once per user-approved execution and held in a
 * ref, so an explicit retry after an uncertain outcome reuses the SAME key. A
 * key minted as a call argument is fresh on every invocation, so a retry the
 * operator makes after a lost response is indistinguishable to the server from
 * a second plan (eiams-frontend-xlfs).
 */
export function usePlanCountMutation() {
  const invalidate = useCountInvalidation()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation({
    mutationFn: (request: PlanCountRequest) => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return countService.planCount(request, idempotencyKeyRef.current)
    },
    onSuccess: () => {
      idempotencyKeyRef.current = null
      invalidate()
    },
  })
}

/** Starts a Planned count, capturing the balance snapshot (Body: expectedRowVersion). */
export function useStartCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (expectedRowVersion: number) =>
      countService.startCount(countId, expectedRowVersion),
    onSuccess: invalidate,
  })
}

/**
 * Batches actual-quantity entry onto count lines (`count.enter`).
 *
 * The wire is the SEMANTIC actuals command of RESOLUTION-025 —
 * `PUT /inventory-counts/{countId}/actuals` with the closed body
 * `{ actuals: [{ lineId, actualQuantity }], expectedRowVersion }` — so the
 * batch carries the COUNT's aggregate row version and no per-line version, and
 * it commits completely or changes nothing.
 *
 * There is deliberately **no `onError` invalidation** here, and that absence is
 * load-bearing rather than an oversight. The quantity-entry workspace feeds the
 * loaded page to react-hook-form through its reseed effects, and a refetch on
 * the error path would reload the lines — including on a `409`, the exact case
 * where keeping the operator's work matters most — and silently discard every
 * quantity they had typed.
 *
 * A `409` is surfaced instead through `isConflictError(error)` at the call
 * boundary, which hands it to `useCountConflictRecovery`. The save is never
 * retried automatically: the client cannot know whether the first attempt
 * landed, so it never re-sends on its own.
 */
export function useUpdateCountLinesMutation(countId: string) {
  const invalidate = useCountInvalidation()
  // One idempotency key per BATCH (RESOLUTION-025). The same batch sent again
  // after an uncertain outcome is an EQUIVALENT retry and reuses the key, so
  // the server can answer with the original result instead of applying the
  // batch twice; a DIFFERENT batch gets a new key, because the server pairs
  // the key with the request it was issued for.
  const batchKeyRef = useRef<{ readonly signature: string; readonly key: IdempotencyKey } | null>(
    null,
  )
  return useMutation({
    mutationFn: (request: UpdateCountLinesRequest) => {
      const signature = JSON.stringify(request)
      if (batchKeyRef.current?.signature !== signature) {
        batchKeyRef.current = { signature, key: createIdempotencyKey() }
      }
      return countService.updateLines(countId, request, batchKeyRef.current.key)
    },
    onSuccess: () => {
      // The batch landed, so the next save is a NEW user-approved execution and
      // gets a new key.
      batchKeyRef.current = null
      invalidate()
    },
  })
}

/**
 * Persists one variance reason (`count.enter`, F3): `PUT
 * /{countId}/lines/{lineId}/variance-reason` with `{ reason,
 * expectedRowVersion }` — the COUNT's row version. Without this save the
 * server blocks Close with `InventoryCounts.VarianceReasonsRequired`.
 */
export function useSetLineVarianceReasonMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (input: SetLineVarianceReasonRequest & { readonly lineId: string }) =>
      countService.setLineVarianceReason(countId, input.lineId, {
        reason: input.reason,
        expectedRowVersion: input.expectedRowVersion,
      }),
    onSuccess: invalidate,
  })
}

/** Cancellation/abort with a required reason (`count.abort`). Arabic errors surface at the call site. */
export function useCancelCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (request: CancelCountRequest) => countService.cancelCount(countId, request),
    onSuccess: invalidate,
  })
}

/** Changes the freeze policy while Planned (`count.plan`). */
export function useSetFreezePolicyMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (request: UpdateFreezePolicyRequest) =>
      countService.setFreezePolicy(countId, request),
    onSuccess: invalidate,
  })
}

/** Marks the count Completed (`count.complete`, idempotent). Retry-safe key, as in plan. */
export function useCompleteCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation({
    mutationFn: (expectedRowVersion: number) => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return countService.completeCount(countId, expectedRowVersion, idempotencyKeyRef.current)
    },
    onSuccess: () => {
      idempotencyKeyRef.current = null
      invalidate()
    },
  })
}

/** Closes the count after variance review (`count.close`). */
export function useCloseCountMutation(countId: string) {
  const invalidate = useCountInvalidation()
  return useMutation({
    mutationFn: (expectedRowVersion: number) =>
      countService.closeCount(countId, expectedRowVersion),
    onSuccess: invalidate,
  })
}

/**
 * Opens the adjustment draft for this count (F8): `POST
 * /{countId}/adjustment` (no body) → 201 `{ id }`. Retry-safe key, as in plan.
 */
export function useCreateAdjustmentMutation(countId: string) {
  const invalidate = useCountInvalidation()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation({
    mutationFn: () => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return countService.createAdjustment(countId, idempotencyKeyRef.current)
    },
    onSuccess: (id) => {
      idempotencyKeyRef.current = null
      invalidate()
      return id
    },
  })
}

/** Exposed for the list filter's own select vocabulary. */
export type { CountStatus, ResourceId }
