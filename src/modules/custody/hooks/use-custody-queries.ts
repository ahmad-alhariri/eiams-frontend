import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { assetQueryKeys } from '@/modules/asset/hooks/use-asset-queries'
import type {
  CustodyMutationRequest,
  ListCustodiesQuery,
} from '@/modules/custody/types/custody.types'
import { custodyService } from '@/modules/custody/services/custody.service'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

export const CUSTODY_RESOURCE = 'custody'

export const custodyQueryKeys = {
  custodies: (scope: ScopeCacheKey, query: ListCustodiesQuery) =>
    queryKeys.scoped(scope, CUSTODY_RESOURCE, 'custodies', query),
  row: (scope: ScopeCacheKey, custodyId: string) =>
    queryKeys.scoped(scope, CUSTODY_RESOURCE, 'custodies', 'row', custodyId),
}

/**
 * Scoped custody list (e19-t01). Callers pass contract filters — the pending
 * list uses `{ status: 'Active', custodyKind: 'Operational' }`, the active
 * list `{ status: 'Active' }`.
 */
export function useCustodiesQuery(query: ListCustodiesQuery) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? queryKeys.public(CUSTODY_RESOURCE, 'custodies', query)
        : custodyQueryKeys.custodies(scope.activeScopeCacheKey, query),
    queryFn: () => custodyService.listCustodies(query),
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
 * Idempotent personal-custody assignment (PRD §12.8). One idempotency key per
 * user action; the caller regenerates only when starting a distinct action.
 */
export function useAssignCustodyMutation() {
  const invalidate = useCustodyInvalidation()
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      request: CustodyMutationRequest
      idempotencyKey: string
    }) => custodyService.assignCustody(request, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

/** Idempotent responsibility transfer for an existing active custody row. */
export function useTransferCustodyMutation() {
  const invalidate = useCustodyInvalidation()
  return useMutation({
    mutationFn: ({
      custodyId,
      request,
      idempotencyKey,
    }: {
      custodyId: string
      request: CustodyMutationRequest
      idempotencyKey: string
    }) => custodyService.transferCustody(custodyId, request, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}
