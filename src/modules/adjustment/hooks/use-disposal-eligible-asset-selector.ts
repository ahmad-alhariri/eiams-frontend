import { useCallback } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { adjustmentQueryKeys } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import type { Asset } from '@/shared/types/generated/eiams-v1'

const DEFAULT_MAX_RESULTS = 10

const disposalEligibleAssetAdapter = createEntitySelectorAdapter<Asset>({
  toOption: (asset) => ({
    value: asset.assetId,
    label: `${asset.assetNumber} — ${asset.material.displayName}`,
    payload: asset,
  }),
})

export interface DisposalEligibleAssetSelectorResult extends EntitySelectorResult<Asset> {
  /** False until both an active scope and a warehouse are available. */
  scopeReady: boolean
}

/**
 * Search-as-you-type binding for the server-authoritative disposal lookup.
 * Each warehouse/search pair is cached through TanStack Query; the selector
 * adapter only maps the returned contract entities into AsyncSelect options.
 */
export function useDisposalEligibleAssetSelector(
  warehouseId: string,
  maxResults = DEFAULT_MAX_RESULTS,
): DisposalEligibleAssetSelectorResult {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const queryClient = useQueryClient()
  const scopeReady = scope !== undefined && warehouseId !== ''

  const loadAssets = useCallback<EntityLoader<Asset>>(
    async (search) => {
      if (scope === undefined || warehouseId === '') {
        return []
      }

      const trimmedSearch = search.trim()
      const query = {
        pageIndex: 0,
        pageSize: Math.max(1, maxResults),
        warehouseId,
        ...(trimmedSearch === '' ? {} : { search: trimmedSearch }),
      }
      const page = await queryClient.fetchQuery({
        queryKey: adjustmentQueryKeys.disposalEligibleAssets(scope, query),
        queryFn: () => adjustmentService.listDisposalEligibleAssets(query),
        staleTime: OPERATIONAL_STALE_TIME,
      })
      return [...page.items]
    },
    [maxResults, queryClient, scope, warehouseId],
  )

  const selector = useScopedEntityOptions(disposalEligibleAssetAdapter, loadAssets, maxResults)
  return { options: disposalEligibleAssetAdapter, loadOptions: selector, scopeReady }
}
