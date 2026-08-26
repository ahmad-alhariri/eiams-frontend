import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived filters and server-side ordering for asset reads (e18-t01). */
export type ListAssetsQuery = NonNullable<operations['listAssets']['parameters']['query']>
export type ListAssetMovementsQuery = NonNullable<
  operations['listAssetMovements']['parameters']['query']
>
