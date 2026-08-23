import { ISSUE_DOCUMENT_LIST_ENTRY } from '@/shared/documents/document-route-entries'
import DocumentListPage from '@/shared/documents/pages/document-list-page'

/**
 * Issue documents list (e16-t02).
 *
 * Thin module seam: pins the shared contract-backed document list to the
 * Issue type and its detail/create routes. The shared page keeps the table,
 * filters, pagination, and error/empty states; reads ride the shared,
 * scope-aware document transport — no issue-specific endpoint or service.
 */
export default function IssueDocumentsListPage() {
  return <DocumentListPage entry={ISSUE_DOCUMENT_LIST_ENTRY} />
}
