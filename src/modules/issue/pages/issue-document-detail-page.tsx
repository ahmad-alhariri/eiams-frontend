import { useParams } from 'react-router'

import { recipientTypeLabelAr } from '@/modules/issue/schemas/issue-info.schema'
import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { IssueTo } from '@/shared/types/generated/eiams-v1'

/**
 * Issue document detail (e16-t07).
 *
 * Thin module seam: pins the shared contract-backed detail page to the Issue
 * route and supplies the read-only IssueTo petal through `petalSlot` — the
 * shared shell renders spine, lines, attachments, timeline, and the
 * policy-driven lifecycle action bar. The petal query shares the detail cache
 * key with the shell, so no extra round-trip occurs after first load.
 */
export default function IssueDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document === undefined || document.issueTo === undefined ? null : (
          <IssuePetalView info={document.issueTo} />
        )
      }
    />
  )
}

function IssuePetalView({ info }: { info: IssueTo }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="نوع الجهة المستلمة">
        {recipientTypeLabelAr(info.recipientType)}
      </DetailField>
      <DetailField label="الجهة المستلمة">{info.recipientDisplayName}</DetailField>
      <DetailField label="سبب الصرف">{info.issueReason}</DetailField>
    </dl>
  )
}
