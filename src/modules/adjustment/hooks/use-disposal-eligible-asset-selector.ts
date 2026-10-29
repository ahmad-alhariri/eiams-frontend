import { useCallback } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { ASSET_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import { adjustmentQueryKeys } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import type { DisposalEligibleAsset } from '@/modules/adjustment/types/adjustment.types'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

const DEFAULT_MAX_RESULTS = 10

/**
 * One picker option per eligible asset, built from the LIVE row the endpoint
 * serves (`id`, `assetNumber`, `materialNameAr`, `currentStatus`, …).
 *
 * The status is part of the label because it decides the effect the SERVER
 * will apply: an `InStock` asset moves the balance by −1, an already `Issued`
 * or `InCustody` one by 0. A manager who cannot see the status cannot tell
 * which of the two they are about to dispose of.
 */
const disposalEligibleAssetAdapter = createEntitySelectorAdapter<DisposalEligibleAsset>({
  toOption: (asset) => ({
    value: asset.id,
    label: `${asset.assetNumber} — ${asset.materialNameAr} — ${ASSET_STATUS_LABELS_AR[asset.currentStatus]}`,
    payload: asset,
  }),
})

export interface DisposalEligibleAssetSelectorResult extends EntitySelectorResult<DisposalEligibleAsset> {
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

  const loadAssets = useCallback<EntityLoader<DisposalEligibleAsset>>(
    async (search) => {
      if (scope === undefined || warehouseId === '') {
        return []
      }

      const trimmedSearch = search.trim()
      const query = {
        page: 1,
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
