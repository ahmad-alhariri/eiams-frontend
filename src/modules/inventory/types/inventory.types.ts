import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived filters and server-side ordering for inventory reads. */
export type ListInventoryBalancesQuery = NonNullable<
  operations['listInventoryBalances']['parameters']['query']
>
export type ListStockMovementsQuery = NonNullable<
  operations['listStockMovements']['parameters']['query']
>
