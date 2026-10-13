import { useParams } from 'react-router'

import { recipientTypeLabelAr } from '@/modules/issue/schemas/issue-info.schema'
import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { IssueToResponse } from '@/shared/documents/types/document-wire.types'

/**
 * Issue document detail (e16-t07).
 *
 * Thin module seam: pins the shared contract-backed detail page to the Issue
 * route and supplies the read-only IssueTo petal through `petalSlot` — the
 * shared shell renders spine, lines, attachments, timeline, and the
 * policy-driven lifecycle action bar. The petal query shares the detail cache
 * key with the shell, so no extra round-trip occurs after first load.
 *
 * `issueTo` is NULLABLE on the real detail projection: a document can be a
 * Posting-side artefact (for example a reversal) whose origin was not recorded
 * through this petal. A missing petal therefore renders nothing rather than an
 * empty card, which is what the previous `!== undefined` check meant.
 */
export default function IssueDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document?.issueTo == null ? null : <IssuePetalView info={document.issueTo} />
      }
    />
  )
}

function IssuePetalView({ info }: { info: IssueToResponse }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="نوع الجهة المستلمة">
        {recipientTypeLabelAr(info.recipientType)}
      </DetailField>
      {/* The projection carries the recipient as id + optional display name; the id is
          shown when the server resolved no name, rather than a blank row. */}
      <DetailField label="الجهة المستلمة">
        {info.recipientDisplayName ?? (
          <span dir="ltr" className="break-all font-mono text-xs">
            {info.recipientId}
          </span>
        )}
      </DetailField>
      <DetailField label="سبب الصرف">{info.issueReason}</DetailField>
    </dl>
  )
}