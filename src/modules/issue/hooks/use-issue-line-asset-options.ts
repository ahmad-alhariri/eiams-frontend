import { useMemo } from 'react'

import { useAssetsQuery } from '@/modules/asset/hooks/use-asset-queries'
import type { Asset } from '@/modules/asset/types/asset.types'

/**
 * Existing-asset options source for the t05 issued-asset selector (D-IAR-01).
 *
 * One scoped query: `/assets?status=InStock` filtered by the line's material
 * and the document's source warehouse. Kept in the issue module — the shared
 * editor stays transport-agnostic through its `assetSlotForLine` seam.
 */
export interface UseIssueLineAssetOptionsResult {
  /** InStock assets for this line's material at the warehouse. */
  assets: readonly Asset[]
  isLoading: boolean
}

export function useIssueLineAssetOptions(
  warehouseId: string | undefined,
  materialId: string | undefined,
): UseIssueLineAssetOptionsResult {
  const enabled =
    warehouseId !== undefined && warehouseId !== '' && materialId !== undefined && materialId !== ''

  const query = useAssetsQuery({
    warehouseId: warehouseId ?? '',
    materialId: materialId ?? '',
    status: 'InStock',
    ...(enabled ? {} : { page: 1, pageSize: 1 }),
  })

  return useMemo(
    () => ({
      assets: query.data?.items ?? [],
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading],
  )
}
