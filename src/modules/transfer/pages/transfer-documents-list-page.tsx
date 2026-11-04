import { TRANSFER_DOCUMENT_LIST_ENTRY } from '@/shared/documents/document-route-entries'
import { useScopedWarehouseSelector } from '@/shared/scopes/use-scoped-warehouse-selector'
import DocumentListPage from '@/shared/documents/pages/document-list-page'

/**
 * Transfer documents list (e17-t02).
 *
 * Thin module seam: pins the shared contract-backed document list to the
 * Transfer type and its detail/create routes and injects the scope-aware
 * warehouse filter binding; the shared page keeps the table, filters,
 * pagination, and error/empty states.
 */
export default function TransferDocumentsListPage() {
  const warehouseSelector = useScopedWarehouseSelector()
  return (
    <DocumentListPage entry={TRANSFER_DOCUMENT_LIST_ENTRY} warehouseSelector={warehouseSelector} />
  )
}
