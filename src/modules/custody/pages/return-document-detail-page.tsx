import { useParams } from 'react-router'

import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { ReturnInfo } from '@/shared/types/generated/eiams-v1'

/**
 * Return document detail (e19-t07).
 *
 * Thin module seam: pins the shared contract-backed detail page to the Return
 * route and supplies the read-only ReturnInfo petal through `petalSlot` — the
 * shared shell renders spine, lines, attachments, timeline, and the
 * policy-driven lifecycle action bar (Draft → Submitted → Posted, with
 * Reject/Cancel paths). The petal query shares the detail cache key with the
 * shell, so no extra round-trip occurs after first load.
 */
export default function ReturnDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document === undefined || document.returnInfo === undefined ? null : (
          <ReturnPetalView info={document.returnInfo} />
        )
      }
    />
  )
}

function ReturnPetalView({ info }: { info: ReturnInfo }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="سند الصرف الأصلي" ltr>
        <span className="font-mono text-sm">{info.originalIssueDocumentId}</span>
      </DetailField>
      <DetailField label="رقم سند الصرف الورقي" ltr>
        {info.originalIssueReference ?? '—'}
      </DetailField>
      <DetailField label="سبب الإرجاع">{info.returnReason}</DetailField>
    </dl>
  )
}
