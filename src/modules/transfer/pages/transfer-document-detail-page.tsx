import { useParams } from 'react-router'

import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { TransferInfo } from '@/shared/types/generated/eiams-v1'

/**
 * Transfer document detail (e17-t06).
 *
 * Thin module seam: pins the shared contract-backed detail page to the
 * Transfer route and supplies the read-only TransferInfo petal through
 * `petalSlot` — the shared shell renders spine, lines, attachments, timeline,
 * and the policy-driven lifecycle action bar. The petal query shares the
 * detail cache key with the shell, so no extra round-trip occurs after first
 * load.
 */
export default function TransferDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document === undefined || document.transferInfo === undefined ? null : (
          <TransferPetalView info={document.transferInfo} />
        )
      }
    />
  )
}

function TransferPetalView({ info }: { info: TransferInfo }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="مستودع الوجهة">{info.destinationWarehouseName}</DetailField>
      <DetailField label="سبب التحويل">{info.transferReason}</DetailField>
    </dl>
  )
}
