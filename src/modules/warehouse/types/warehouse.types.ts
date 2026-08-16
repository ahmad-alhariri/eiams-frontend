import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived server-side filters for warehouse and material-setting lists. */
export type ListWarehousesQuery = NonNullable<operations['listWarehouses']['parameters']['query']>
export type ListWarehouseMaterialSettingsQuery = NonNullable<
  operations['listWarehouseMaterialSettings']['parameters']['query']
>
