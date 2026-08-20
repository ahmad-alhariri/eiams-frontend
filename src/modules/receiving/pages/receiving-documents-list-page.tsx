import { RECEIVING_DOCUMENT_LIST_ENTRY } from '@/shared/documents/document-route-entries'
import DocumentListPage from '@/shared/documents/pages/document-list-page'

/**
 * Receiving documents list (e13-t02).
 *
 * Thin module seam: pins the shared contract-backed document list to the
 * Receiving type and its detail route, so the module owns its page while the
 * shared page keeps the table, filters, pagination, and error/empty states.
 */
export default function ReceivingDocumentsListPage() {
  return <DocumentListPage entry={RECEIVING_DOCUMENT_LIST_ENTRY} />
}
