import { useParams } from 'react-router'

import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { TransferInfoResponse } from '@/shared/documents/types/document-wire.types'

/**
 * Transfer document detail (e17-t06).
 *
 * Thin module seam: pins the shared contract-backed detail page to the
 * Transfer route and supplies the read-only TransferInfo petal through
 * `petalSlot` — the shared shell renders spine, lines, attachments, timeline,
 * and the policy-driven lifecycle action bar. The petal query shares the
 * detail cache key with the shell, so no extra round-trip occurs after first
 * load.
 *
 * `transferInfo` is NULLABLE on the real detail projection (see the Issue seam
 * for the reasoning), so an absent petal renders nothing.
 */
export default function TransferDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document?.transferInfo == null ? null : <TransferPetalView info={document.transferInfo} />
      }
    />
  )
}

function TransferPetalView({ info }: { info: TransferInfoResponse }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {/* The projection carries the destination warehouse as an id only — there is no
          display reference on the wire, so the id is shown rather than a name the
          server never sent. */}
      <DetailField label="مستودع الوجهة" ltr>
        <span className="break-all font-mono text-xs">{info.destinationWarehouseId}</span>
      </DetailField>
      <DetailField label="سبب التحويل">{info.transferReason}</DetailField>
    </dl>
  )
}
