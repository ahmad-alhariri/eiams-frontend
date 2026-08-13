import type { Warehouse } from '@/shared/types/generated/eiams-v1'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type WarehouseLoader = EntityLoader<Warehouse>

/**
 * Warehouse selector adapter: label = Arabic name, hint = code (carried in the
 * payload), and inactive warehouses are disabled. The contract exposes full
 * `Warehouse` entities — there is no dedicated WarehouseReference type; document
 * references reuse the generic NamedReference shape (named-reference-selector).
 */
const warehouseAdapter: EntitySelectorAdapter<Warehouse> = createEntitySelectorAdapter<Warehouse>({
  toOption: (warehouse) => ({
    value: warehouse.warehouseId,
    label: warehouse.nameAr,
    disabled: warehouse.status !== 'Active',
    payload: warehouse,
  }),
})

/**
 * Scope-ready warehouse selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useWarehouseSelector(
  loadWarehouses: WarehouseLoader,
): EntitySelectorResult<Warehouse> {
  const loadOptions = useScopedEntityOptions(warehouseAdapter, loadWarehouses)
  return { options: warehouseAdapter, loadOptions }
}
