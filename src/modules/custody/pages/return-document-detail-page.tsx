import { Link, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { DetailField } from '@/shared/layout/detail-field'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'
import { useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import type { ReturnInfoResponse } from '@/shared/documents/types/document-wire.types'

/**
 * Return document detail (e19-t07).
 *
 * Thin module seam: pins the shared contract-backed detail page to the Return
 * route and supplies the read-only ReturnInfo petal through `petalSlot` — the
 * shared shell renders spine, lines, attachments, timeline, and the
 * policy-driven lifecycle action bar (Draft → Submitted → Posted, with
 * Reject/Cancel paths). The petal query shares the detail cache key with the
 * shell, so no extra round-trip occurs after first load.
 *
 * `returnInfo` is NULLABLE on the real detail projection (see the Issue seam for
 * the reasoning), so an absent petal renders nothing.
 *
 * The projection also dropped two fields the snapshot had: `assetIds` (the
 * returned assets are on the document's own `lines[].selectedAssets`, rendered by
 * the shared lines card) and `originalIssueReference` (the live route has no slot
 * for it). Neither is faked here.
 */
export default function ReturnDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const detail = useDocumentDetailQuery(documentId ?? null)
  const document = detail.data

  return (
    <DocumentDetailPage
      petalSlot={
        document?.returnInfo == null ? null : <ReturnPetalView info={document.returnInfo} />
      }
    />
  )
}

function ReturnPetalView({ info }: { info: ReturnInfoResponse }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="سند الصرف الأصلي" ltr>
        <Link
          className="break-all font-mono text-sm underline-offset-4 hover:underline"
          to={ROUTE_PATHS.documentIssueDetail.replace(':documentId', info.originalIssueDocumentId)}
        >
          {info.originalIssueDocumentId}
        </Link>
      </DetailField>
      <DetailField label="سبب الإرجاع">{info.returnReason}</DetailField>
      {info.originalRecipientId === null ? null : (
        <DetailField label="الجهة الأصلية">
          {info.originalRecipientDisplayName ?? (
            <span dir="ltr" className="break-all font-mono text-xs">
              {info.originalRecipientId}
            </span>
          )}
        </DetailField>
      )}
    </dl>
  )
}