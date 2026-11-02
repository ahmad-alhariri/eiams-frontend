import { RETURN_DOCUMENT_LIST_ENTRY } from '@/shared/documents/document-route-entries'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import DocumentListPage from '@/shared/documents/pages/document-list-page'

/**
 * Return documents list (e19).
 *
 * Thin module seam: pins the shared contract-backed document list to the
 * Return type and its detail/create routes and injects the scope-aware
 * warehouse filter binding; the shared page keeps the table, filters,
 * pagination, and error/empty states.
 */
export default function ReturnDocumentsListPage() {
  const warehouseSelector = useScopedWarehouseSelector()
  return (
    <DocumentListPage entry={RETURN_DOCUMENT_LIST_ENTRY} warehouseSelector={warehouseSelector} />
  )
}
