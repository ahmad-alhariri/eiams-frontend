import { Link, useParams } from 'react-router'

import { AdjustmentActionBar } from '@/modules/adjustment/components/adjustment-action-bar'
import {
  ADJUSTMENT_PURPOSE_LABELS_AR,
  isDisposalPurpose,
} from '@/modules/adjustment/types/adjustment.types'
import { useAdjustmentDetailQuery } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { AttachmentPanel } from '@/shared/documents/attachment-panel'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import type { DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Adjustment detail page (e21-t07): server-authoritative read model with
 * the manager action bar (e21-t06) and the read-only attachment panel
 * showing the SignedOriginal posting gate (D-ATT-01 slice of the embedded
 * policy). Disposal adjustments render their terminal state explicitly —
 * no reversal affordance exists anywhere on this surface.
 */
export default function AdjustmentDetailPage() {
  const { adjustmentId } = useParams<{ adjustmentId: string }>()
  const detailQuery = useAdjustmentDetailQuery(adjustmentId)
  const adjustment = detailQuery.data

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

  const attachments: readonly DocumentAttachment[] = adjustment.attachments ?? []

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={
          <>
            {ROUTE_METADATA.adjustmentDetail.labelAr}
            <span dir="ltr" className="font-english text-muted-foreground">
              {' '}
              — {adjustment.documentReference}
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

      <div className="grid gap-5">
        <ContentCard title="بيانات السند">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="الحالة">
              <StatusBadge entity="adjustment" status={adjustment.status} />
            </DetailField>
            <DetailField label="الغرض">
              {ADJUSTMENT_PURPOSE_LABELS_AR[adjustment.purpose]}
            </DetailField>
            <DetailField label="المستودع">{adjustment.warehouse.displayName}</DetailField>
            <DetailField label="مرجع الجرد" ltr>
              {adjustment.countReference ?? '—'}
            </DetailField>
            <DetailField label="سبب التسوية">{adjustment.reason}</DetailField>
            <DetailField label="أُنشئ في" ltr>
              {formatDateTime(adjustment.createdAt ?? '')}
            </DetailField>
            {adjustment.postedAt !== null && adjustment.postedAt !== undefined ? (
              <DetailField label="رُحِّل في" ltr>
                {formatDateTime(adjustment.postedAt)}
              </DetailField>
            ) : null}
            {isDisposalPurpose(adjustment.purpose) && adjustment.status === 'Posted' ? (
              <DetailField label="حالة نهائية">سند إعدام مرحّل لا يقبل العكس</DetailField>
            ) : null}
          </dl>
        </ContentCard>

        <AdjustmentActionBar
          adjustmentId={adjustment.adjustmentId}
          status={adjustment.status}
          purpose={adjustment.purpose}
          rowVersion={adjustment.rowVersion}
          actions={adjustment.policy.actions}
          blockers={adjustment.policy.blockers}
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
                    <tr key={line.adjustmentLineId} data-slot="adjustment-line-row">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {line.material.displayName}
                        {line.assetNumber !== null && line.assetNumber !== undefined ? (
                          <span className="ms-2 text-xs text-muted-foreground" dir="ltr">
                            أصل: {line.assetNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-foreground" dir="ltr">
                        {line.quantityDelta > 0 ? `+${line.quantityDelta}` : line.quantityDelta}
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
            attachments={attachments}
            pendingUploads={[]}
            onUpload={() => undefined}
            onRemove={() => undefined}
            onCancelPending={() => undefined}
            isUploading={false}
            readOnly
            policy={{
              signedOriginalSatisfied: adjustment.policy.signedOriginalSatisfied,
              blockers: adjustment.policy.blockers,
            }}
          />
        </ContentCard>
      </div>
    </div>
  )
}
