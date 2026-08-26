import { OPENING_DOCUMENT_LIST_ENTRY } from '@/shared/documents/document-route-entries'
import DocumentListPage from '@/shared/documents/pages/document-list-page'

/**
 * Opening-balance document list (e15-t01).
 *
 * The v1 contract models an opening balance as a WarehouseDocument with the
 * `Opening` type, not as a separate resource. This thin module seam binds the
 * shared, scope-aware document transport and list composition to that type;
 * it deliberately does not duplicate a nonexistent opening-specific endpoint.
 */
export default function OpeningDocumentsListPage() {
  return <DocumentListPage entry={OPENING_DOCUMENT_LIST_ENTRY} />
}
