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
 * for it). The latter is NOT faked: the petal resolves the original issue's
 * system/paper reference from its own detail read instead of showing the uuid.
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
        <OriginalIssueLink originalIssueDocumentId={info.originalIssueDocumentId} />
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

/**
 * The projection carries the original issue only as its function-generated id,
 * which an operator can neither read nor verify against the paper archive, so
 * the issue's own detail read (same shared query hooks, one extra GET) resolves
 * its system reference — e.g. «DMS-ISS-2026-000032 (E2E-ISS-182557/2026)» —
 * while the paper number/year pair it also carries is appended when present.
 * Until (or without) that read, the raw id stays the fallback so the link
 * always points at the issue.
 */
function OriginalIssueLink({ originalIssueDocumentId }: { originalIssueDocumentId: string }) {
  const issue = useDocumentDetailQuery(originalIssueDocumentId).data ?? null

  const reference =
    issue === null
      ? originalIssueDocumentId
      : issue.paperDocumentNumber === null || issue.paperDocumentYear === null
        ? issue.systemReferenceNumber
        : `${issue.systemReferenceNumber} (${issue.paperDocumentNumber}/${issue.paperDocumentYear})`

  return (
    <Link
      className="break-all font-mono text-sm underline-offset-4 hover:underline"
      to={ROUTE_PATHS.documentIssueDetail.replace(':documentId', originalIssueDocumentId)}
    >
      {reference}
    </Link>
  )
}
