import { useMaterialQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { useWarehouseName } from '@/modules/inventory-count/hooks/use-count-names'

/**
 * A line's material name, straight from the catalog single-read. The raw id is
 * never rendered: a neutral placeholder while the read is in flight, an em dash
 * when it fails.
 */
export function CountMaterialName({ materialId }: { materialId: string }) {
  const query = useMaterialQuery(materialId)
  if (query.data !== undefined) {
    return <span>{query.data.nameAr}</span>
  }
  if (query.isError) {
    return <span className="text-muted-foreground">—</span>
  }
  return <span className="text-muted-foreground">جارٍ تحميل اسم المادة...</span>
}

/** A count's warehouse name (raw id when the warehouse read has not resolved yet). */
export function CountWarehouseName({ warehouseId }: { warehouseId: string }) {
  return <span>{useWarehouseName(warehouseId)}</span>
}
