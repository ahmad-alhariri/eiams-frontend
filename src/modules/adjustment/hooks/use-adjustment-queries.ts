import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type {
  AdjustmentDraftRequest,
  ListAdjustmentsQuery,
  ListDisposalEligibleAssetsQuery,
  UpdateAdjustmentRequest,
} from '@/modules/adjustment/types/adjustment.types'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { createIdempotencyKey } from '@/shared/services/mutation-safety'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import {
  queryKeys,
  type ScopeCacheKey,
} from '@/shared/services/query-keys'

const ADJUSTMENT_RESOURCE = 'adjustments'

/**
 * Resource-name literals owned by sibling modules whose caches an adjustment
 * mutation touches (`inventory`, `asset`, `custody`). They are exported here
 * so the invalidation helper can target them precisely through the shared
 * `queryKeys` factory instead of raw array literals.
 */
export const CROSS_MODULE_RESOURCES = {
  inventory: 'inventory',
  asset: 'asset',
  custody: 'custody',
} as const

export const adjustmentQueryKeys = {
  adjustments: (scope: ScopeCacheKey, query: ListAdjustmentsQuery) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'adjustments', query),
  adjustment: (scope: ScopeCacheKey, adjustmentId: string) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'adjustment', adjustmentId),
  disposalEligibleAssets: (scope: ScopeCacheKey, query: ListDisposalEligibleAssetsQuery) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'disposal-eligible-assets', query),
}

const EMPTY_DISPOSAL_QUERY: ListDisposalEligibleAssetsQuery = {}

/**
 * Shared invalidation for every adjustment mutation.
 *
 * Posting or reversing an adjustment moves stock and (for disposal) closes
 * custody — so the inventory balance/movement ledgers, asset registry/status,
 * and custody caches are invalidated alongside the adjustment list/detail keys.
 * Every scoped cache lives under `[scoped, ...scopeParts, <resource>, ...]`.
 */
function useAdjustmentInvalidation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext()
  return (adjustmentId: string) => {
    if (scope.activeScopeCacheKey === undefined) return
    const { inventory, asset, custody } = CROSS_MODULE_RESOURCES
    const scopeKey = queryKeys.scopeOnly(scope.activeScopeCacheKey)
    // Adjustment: invalidate the specific instance and all list variants using
    // queryKey so callers/observers see the same scoped shape. The broad
    // resource-level invalidation (key[3] === 'adjustments') is what existing
    // contract tests assert against.
    void queryClient.invalidateQueries({
      queryKey: [...scopeKey, ADJUSTMENT_RESOURCE],
    })
    void queryClient.invalidateQueries({
      queryKey: [...scopeKey, ADJUSTMENT_RESOURCE, 'adjustment', adjustmentId],
    })
    // Cross-module resources: invalidate the full tree under each resource.
    for (const resource of [inventory, asset, custody] as const) {
      void queryClient.invalidateQueries({
        queryKey: [...scopeKey, resource],
      })
    }
  }
}

/**
 * Paged adjustments for the active scope (e21-t02). Operational data — 30s
 * stale time per the architecture's stale-time policy.
 */
export function useAdjustmentsListQuery(query: ListAdjustmentsQuery) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? queryKeys.public(ADJUSTMENT_RESOURCE, 'adjustments', query)
        : adjustmentQueryKeys.adjustments(scope.activeScopeCacheKey, query),
    queryFn: () => adjustmentService.listAdjustments(query),
    enabled: scope.activeScopeCacheKey !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Single adjustment with its manager-owned lifecycle state and policy.
 */
export function useAdjustmentDetailQuery(adjustmentId: string | undefined | null) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined || adjustmentId == null
        ? queryKeys.public(ADJUSTMENT_RESOURCE, 'adjustment', adjustmentId)
        : adjustmentQueryKeys.adjustment(scope, adjustmentId),
    queryFn: () => adjustmentService.getAdjustment(adjustmentId ?? ''),
    enabled: scope !== undefined && adjustmentId != null && adjustmentId !== '',
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Authoritative disposal-eligible asset lookup (D-ADJ-01): disposal selection
 * must come from this server-provided list; free-text asset identities are
 * never permitted.
 */
export function useDisposalEligibleAssetsQuery(
  query: ListDisposalEligibleAssetsQuery = EMPTY_DISPOSAL_QUERY,
) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ADJUSTMENT_RESOURCE, 'disposal-eligible-assets', query)
        : adjustmentQueryKeys.disposalEligibleAssets(scope, query),
    queryFn: () => adjustmentService.listDisposalEligibleAssets(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Creates a Draft adjustment (manager-only per D-ADJ-01).
 */
export function useCreateAdjustmentMutation() {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: (request: AdjustmentDraftRequest) => adjustmentService.createAdjustment(request),
    onSuccess: (result) => invalidate(result.adjustmentId),
  })
}

/**
 * Updates a mutable Draft adjustment.
 */
export function useUpdateAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: (request: UpdateAdjustmentRequest) =>
      adjustmentService.updateAdjustment(adjustmentId, request),
    onSuccess: (result) => invalidate(result.adjustmentId),
  })
}

/**
 * Posts the Draft (`post`, idempotent). Server owns the SignedOriginal gate.
 */
export function usePostAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: (rowVersion: number) =>
      adjustmentService.postAdjustment(adjustmentId, rowVersion, createIdempotencyKey()),
    onSuccess: (result) => {
      // The server returns { adjustment: InventoryAdjustment, ... }.
      // Extract the authoritative adjustment id from the returned document.
      const returnedId = result?.adjustment?.adjustmentId ?? adjustmentId
      invalidate(returnedId)
    },
  })
}

/**
 * Reverses a Posted ordinary adjustment through a compensating document.
 */
export function useReverseAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: ({ reason, rowVersion }: { reason: string; rowVersion: number }) =>
      adjustmentService.reverseAdjustment(adjustmentId, rowVersion, reason, createIdempotencyKey()),
    onSuccess: (result) => {
      const returnedId = result?.compensatingAdjustment?.adjustmentId ?? adjustmentId
      invalidate(returnedId)
    },
  })
}
