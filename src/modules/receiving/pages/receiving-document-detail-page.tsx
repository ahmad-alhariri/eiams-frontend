import { useParams } from 'react-router'

import { ReceivingPetalView } from '@/modules/receiving/components/receiving-petal-view'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'

/**
 * Receiving document detail (e13-t06).
 *
 * Thin module seam: pins the shared contract-backed detail page to the
 * Receiving route and supplies the read-only ReceivingInfo petal through
 * `petalSlot` — the shared shell renders spine, lines, attachments, and the
 * lifecycle action bar, while the petal is the receiving-specific part. The
 * petal query shares the detail cache key with the shell, so no extra network
 * round-trip occurs after the first load.
 */
export default function ReceivingDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document === undefined || document.receivingInfo === undefined ? null : (
          <ReceivingPetalView info={document.receivingInfo} />
        )
      }
    />
  )
}
