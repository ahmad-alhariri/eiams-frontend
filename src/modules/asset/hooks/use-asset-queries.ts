import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { assetService } from '@/modules/asset/services/asset.service'
import type { ListAssetMovementsQuery, ListAssetsQuery } from '@/modules/asset/types/asset.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const ASSET_RESOURCE = 'asset'

export const assetQueryKeys = {
  assets: (scope: ScopeCacheKey, query: ListAssetsQuery) =>
    queryKeys.scoped(scope, ASSET_RESOURCE, 'assets', query),
  asset: (scope: ScopeCacheKey, assetId: string) =>
    queryKeys.scoped(scope, ASSET_RESOURCE, 'assets', assetId),
  custody: (scope: ScopeCacheKey, assetId: string) =>
    queryKeys.scoped(scope, ASSET_RESOURCE, 'assets', assetId, 'custody'),
  movements: (scope: ScopeCacheKey, assetId: string, query: ListAssetMovementsQuery) =>
    queryKeys.scoped(scope, ASSET_RESOURCE, 'assets', assetId, 'movements', query),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

/** Registry read with derived-status filter (e18-t01). */
export function useAssetsQuery(query: ListAssetsQuery) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ASSET_RESOURCE, 'assets', query)
        : assetQueryKeys.assets(scope, query),
    queryFn: () => assetService.listAssets(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useAssetQuery(assetId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || assetId === undefined
        ? queryKeys.public(ASSET_RESOURCE, 'assets', assetId)
        : assetQueryKeys.asset(scope, assetId),
    queryFn: () => assetService.getAsset(assetId ?? ''),
    enabled: scope !== undefined && assetId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Current + historical custody rows for one asset. */
export function useAssetCustodyTimelineQuery(assetId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || assetId === undefined
        ? queryKeys.public(ASSET_RESOURCE, 'custody', assetId)
        : assetQueryKeys.custody(scope, assetId),
    queryFn: () => assetService.getAssetCustodyTimeline(assetId ?? ''),
    enabled: scope !== undefined && assetId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useAssetMovementsQuery(
  assetId: string | undefined,
  query: ListAssetMovementsQuery,
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || assetId === undefined
        ? queryKeys.public(ASSET_RESOURCE, 'movements', assetId, query)
        : assetQueryKeys.movements(scope, assetId, query),
    queryFn: () => assetService.listAssetMovements(assetId ?? '', query),
    enabled: scope !== undefined && assetId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
