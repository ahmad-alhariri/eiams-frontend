import { Link, useParams } from 'react-router'

import { AdjustmentActionBar } from '@/modules/adjustment/components/adjustment-action-bar'
import { useAdjustmentDetailQuery } from '@/modules/adjustment/hooks/use-adjustment-queries'
import {
  ADJUSTMENT_PURPOSE_LABELS_AR,
  isDisposalPurpose,
} from '@/modules/adjustment/types/adjustment.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { AttachmentPanel } from '@/shared/documents/attachment-panel'
import { useDocumentAttachmentManager } from '@/shared/documents/use-document-attachments'
import { useDocumentPolicyQuery } from '@/shared/documents/use-document-queries'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Adjustment detail page (e21-t07). The server-aware read model comes from the
 * module's own `/adjustments/{id}` read; the attached policy and attachment
 * read/write surface are the shared document engine's, keyed by the SAME
 * document id (on the server an adjustment's `id` is the document id — the
 * adjustment response embeds neither policy nor attachments, and none are
 * invented here). The manager action bar (e21-t06) is driven by the shared
 * policy read. Disposal adjustments render their terminal state explicitly —
 * no reversal affordance exists anywhere on this surface.
 */
export default function AdjustmentDetailPage() {
  const { adjustmentId } = useParams<{ adjustmentId: string }>()
  const detailQuery = useAdjustmentDetailQuery(adjustmentId)
  const adjustment = detailQuery.data

  // The adjustment's own id is the shared document engine's documentId.
  const documentId = adjustment === undefined ? null : adjustment.id
  const policyQuery = useDocumentPolicyQuery(documentId)
  const attachmentManager = useDocumentAttachmentManager(documentId)

  if (detailQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل سند التسوية..." />
  }
  if (detailQuery.isError || adjustment === undefined) {
    return (
      <ErrorState
        title="تعذّر تحميل سند التسوية"
        description="تعذّر جلب بيانات هذا السند. حاول مرة أخرى."
      />
    )
  }
  if (policyQuery.isPending) {
    return <LoadingSpinner label="جارٍ تحميل سياسة الترحيل..." />
  }
  if (policyQuery.isError || policyQuery.data === undefined) {
    return (
      <ErrorState
        title="تعذّر تحميل سياسة الترحيل"
        description="تعذّر جلب تقييم الخادم لإمكانية ترحيل هذا السند. حاول مرة أخرى."
      />
    )
  }
  const policy = policyQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={
          <>
            {ROUTE_METADATA.adjustmentDetail.labelAr}
            <span dir="ltr" className="font-english text-muted-foreground">
              {' '}
              — {adjustment.systemReferenceNumber}
            </span>
          </>
        }
        toolbar={
          <Link
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            to={ROUTE_PATHS.adjustments}
          >
            العودة إلى سندات التسوية
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5">
        <ContentCard title="بيانات السند">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="الحالة">
              <StatusBadge entity="adjustment" status={adjustment.status} />
            </DetailField>
            <DetailField label="الغرض">
              {ADJUSTMENT_PURPOSE_LABELS_AR[adjustment.purpose]}
            </DetailField>
            <DetailField label="المستودع">{adjustment.warehouseName}</DetailField>
            <DetailField label="سبب التسوية">{adjustment.reason}</DetailField>
            <DetailField label="أُنشئ في" ltr>
              {formatDateTime(adjustment.createdAtUtc)}
            </DetailField>
            {adjustment.postedAtUtc !== null ? (
              <DetailField label="رُحِّل في" ltr>
                {formatDateTime(adjustment.postedAtUtc)}
              </DetailField>
            ) : null}
            {isDisposalPurpose(adjustment.purpose) && adjustment.status === 'Posted' ? (
              <DetailField label="حالة نهائية">سند إعدام مرحّل لا يقبل العكس</DetailField>
            ) : null}
          </dl>
        </ContentCard>

        <AdjustmentActionBar
          adjustmentId={adjustment.id}
          status={adjustment.status}
          purpose={adjustment.purpose}
          rowVersion={adjustment.rowVersion}
          actions={policy.actions}
          blockers={policy.blockers}
          advisories={policy.warnings}
        />

        <ContentCard title="بنود الفروقات">
          {adjustment.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بنود على هذا السند.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-slot="adjustment-lines-table" className="w-full min-w-130 text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      المادة
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      فرق الكمية (+/−)
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      سبب الفرق
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {adjustment.lines.map((line) => (
                    <tr key={line.lineId} data-slot="adjustment-line-row">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {line.materialNameAr}
                        {line.assets.map((asset) => (
                          <span
                            key={asset.id}
                            className="ms-2 text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            أصل: {asset.assetNumber}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-foreground" dir="ltr">
                        {line.difference > 0 ? `+${line.difference}` : line.difference}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{line.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ContentCard>

        <ContentCard
          title="المرفقات"
          description="النسخة الأصلية الموقعة شرط إلزامي للترحيل؛ يتحقق منها الخادم قبل قبول أي ترحيل."
        >
          <AttachmentPanel
            attachments={attachmentManager.attachments}
            pendingUploads={attachmentManager.pendingUploads}
            onUpload={attachmentManager.onUpload}
            onRemove={attachmentManager.onRemove}
            onCancelPending={attachmentManager.onCancelPending}
            isUploading={attachmentManager.isUploading}
            uploadError={attachmentManager.uploadError}
            deleteError={attachmentManager.deleteError}
            readOnly={attachmentManager.readOnly}
            disabled={attachmentManager.disabled}
            policy={policy}
            documentStatus={adjustment.documentStatus}
          />
        </ContentCard>
      </div>
    </div>
  )
}
