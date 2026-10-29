import { useCallback, useMemo } from 'react'

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
  /**
   * The read FAILED and holds no cached rows, so `assets` says NOTHING about
   * what the warehouse holds: it is empty because the server never answered,
   * not because there is no asset to issue. A failed read must stay
   * distinguishable from an empty one, so the caller gets its own Arabic
   * surface and a retry instead of a silently empty picker.
   */
  isError: boolean
  /** Re-runs the failed read. */
  retry: () => void
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

  const { refetch } = query
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  return useMemo(
    () => ({
      assets: query.data?.items ?? [],
      isLoading: query.isLoading,
      // A background refetch that fails over cached rows keeps serving them
      // (the server's last answer is still the server's answer), so the
      // failure is reported only when NOTHING is known.
      isError: query.isError && query.data === undefined,
      retry,
    }),
    [query.data, query.isError, query.isLoading, retry],
  )
}
