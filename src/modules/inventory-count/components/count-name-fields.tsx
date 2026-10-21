import { useMaterialName, useWarehouseName } from '@/modules/inventory-count/hooks/use-count-names'

/** A line's material name (raw id when the catalog read has not resolved yet). */
export function CountMaterialName({ materialId }: { materialId: string }) {
  return <span>{useMaterialName(materialId)}</span>
}

/** A count's warehouse name (raw id when the warehouse read has not resolved yet). */
export function CountWarehouseName({ warehouseId }: { warehouseId: string }) {
  return <span>{useWarehouseName(warehouseId)}</span>
}
