import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { assetQueryKeys } from '@/modules/asset/hooks/use-asset-queries'
import type {
  AssignAssetCustodyRequest,
  ListCustodiesQuery,
  ListPendingCustodiesQuery,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'
import { custodyService } from '@/modules/custody/services/custody.service'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

export const CUSTODY_RESOURCE = 'custody'

export const custodyQueryKeys = {
  custodies: (scope: ScopeCacheKey, query: ListCustodiesQuery) =>
    queryKeys.scoped(scope, CUSTODY_RESOURCE, 'custodies', query),
  pending: (scope: ScopeCacheKey, query: ListPendingCustodiesQuery) =>
    queryKeys.scoped(scope, CUSTODY_RESOURCE, 'custodies', 'pending', query),
  row: (scope: ScopeCacheKey, custodyId: string) =>
    queryKeys.scoped(scope, CUSTODY_RESOURCE, 'custodies', 'row', custodyId),
}

/**
 * Scoped custody list. Callers pass the live `GET /custodies` filters —
 * `holderType`, `holderId`, `materialId`, `subjectType`, `status`,
 * `warehouseId` — plus the one-based `page` / `pageSize`.
 */
export function useCustodiesQuery(query: ListCustodiesQuery) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? queryKeys.unscoped(CUSTODY_RESOURCE, 'custodies', query)
        : custodyQueryKeys.custodies(scope.activeScopeCacheKey, query),
    queryFn: () => custodyService.listCustodies(query),
    enabled: scope.activeScopeCacheKey !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Warehouse-scoped pending list: the Operational + Active custody rows of the
 * assets issued out of one warehouse, i.e. the rows that still await a
 * personal assignment.
 *
 * The warehouse id is REQUIRED: the live endpoint binds a non-nullable
 * `Guid WarehouseId` and answers 404 for an unknown one, so no request may
 * leave without it. Callers resolve it before rendering the list.
 */
export function usePendingCustodiesQuery(warehouseId: string, page: number, pageSize: number) {
  const scope = useActiveScopeContext()
  const query: ListPendingCustodiesQuery = { warehouseId, page, pageSize }
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? queryKeys.unscoped(CUSTODY_RESOURCE, 'custodies', 'pending', query)
        : custodyQueryKeys.pending(scope.activeScopeCacheKey, query),
    queryFn: () => custodyService.listPendingCustodies(query),
    enabled: scope.activeScopeCacheKey !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

function useCustodyInvalidation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext()
  return () => {
    if (scope.activeScopeCacheKey === undefined) {
      return
    }

    // The scoped namespace root also covers the detail row key, so a detail
    // page open beside the assign/transfer dialog refetches with the list.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(scope.activeScopeCacheKey, CUSTODY_RESOURCE),
    })
    // Custody changes also move assets between derived statuses. The previous
    // `['asset']` fragment matched no real key, because every asset key is
    // `['scoped', kind, id, 'asset', ...]` (eiams-frontend-jkel).
    void queryClient.invalidateQueries({
      queryKey: assetQueryKeys.all(scope.activeScopeCacheKey),
    })
  }
}

/**
 * Personal custody assignment. The live controller answers with `{ id }` only
 * — the new custody row's id, not the full row — so the caller invalidates
 * the custody + asset query trees on success to refetch the refreshed list.
 * The Idempotency-Key header is dropped because the live controller
 * (AssignAssetCustodyController.cs) does not accept one.
 */
export function useAssignCustodyMutation() {
  const invalidate = useCustodyInvalidation()
  return useMutation({
    mutationFn: ({ assetId, request }: { assetId: string; request: AssignAssetCustodyRequest }) =>
      custodyService.assignCustody(assetId, request),
    onSuccess: (_data, variables) => {
      // Keep the asset id adjacent to the request so the future telemetry
      // path can pair it; today nothing here reads it because invalidation
      // already covers every custody + asset key in the active scope.
      void variables
      invalidate()
    },
  })
}

/** Responsibility transfer for an existing active custody row. */
export function useTransferCustodyMutation() {
  const invalidate = useCustodyInvalidation()
  return useMutation({
    mutationFn: ({ custodyId, request }: { custodyId: string; request: TransferCustodyRequest }) =>
      custodyService.transferCustody(custodyId, request),
    onSuccess: invalidate,
  })
}
