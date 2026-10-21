import { useMaterialQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { useWarehouseQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'

/**
 * Display-name resolution for the count module (IC-FE-1 NAMES/labels rule).
 *
 * The live count DTOs carry ids and numbers only, so the UI resolves each id
 * through the owning module's single-read endpoint (`GET /warehouses/{id}`,
 * `GET /catalog/materials/{materialId}`) with TanStack Query per-id caching: a
 * given id is fetched once. The hooks come from `warehouse`/`catalog` - the
 * count module NEVER joins a paginated list client-side. An id that cannot be
 * resolved renders as the raw id; nothing here can crash on a missing name.
 */
export function useMaterialName(materialId: string | undefined): string {
  const query = useMaterialQuery(materialId)
  if (materialId === undefined || materialId === '') {
    return ''
  }
  return query.data?.nameAr ?? materialId
}

export function useWarehouseName(warehouseId: string | undefined): string {
  const query = useWarehouseQuery(warehouseId)
  if (warehouseId === undefined || warehouseId === '') {
    return ''
  }
  return query.data?.name ?? warehouseId
}
