import { Link, useParams } from 'react-router'

import { TransferCustodyDialog } from '@/modules/custody/components/transfer-custody-dialog'
import { CustodyStatusBadge } from '@/modules/custody/components/custody-status-badge'
import { useCustodyRowQuery } from '@/modules/custody/hooks/use-custody-row-query'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Custody detail page: one active or historical custody row with its holder
 * and asset context. The responsibility transfer flow composes here as a
 * dialog gated by `custody.assign`.
 *
 * The live row is flat: `holderDisplayName` + `holderType`/`holderId` for the
 * holder, `subjectId` for the asset the row is about, and `fromUtc` / `toUtc`
 * for the custody period.
 */
export default function CustodyDetailPage() {
  const { custodyId } = useParams<{ custodyId: string }>()
  const rowQuery = useCustodyRowQuery(custodyId)
  const row = rowQuery.data
  const { has } = usePermission()
  const canTransfer = has('custody.assign') && row?.status === 'Active'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyDetail.labelAr}
        subtitle={
          row === undefined || row === null
            ? undefined
            : `${row.assetNumber ?? row.materialNameAr} — ${row.holderDisplayName}`
        }
        toolbar={
          row === undefined || row === null ? null : <CustodyStatusBadge status={row.status} />
        }
      />

      {rowQuery.isLoading ? (
        <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل العهدة..." />
      ) : rowQuery.isError || row === null || row === undefined ? (
        <ErrorState
          title="تعذّر تحميل العهدة"
          description="تعذّر جلب تفاصيل هذه العهدة. حاول مرة أخرى."
          action={
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => void rowQuery.refetch()}
            >
              إعادة المحاولة
            </button>
          }
        />
      ) : (
        <>
          <ContentCard title="بيانات العهدة">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="رقم الأصل">
                {row.assetNumber === null ? (
                  <span>{row.materialNameAr}</span>
                ) : (
                  <Link
                    className="font-mono text-sm font-semibold underline-offset-4 hover:underline"
                    to={ROUTE_PATHS.assetDetail.replace(':assetId', row.subjectId)}
                  >
                    <span dir="ltr">{row.assetNumber}</span>
                  </Link>
                )}
              </DetailField>
              <DetailField label="الحائز">{row.holderDisplayName}</DetailField>
              <DetailField label="نوع الحائز" ltr>
                {row.holderType}
              </DetailField>
              <DetailField label="نوع الحفظ">
                {row.custodyKind === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'}
              </DetailField>
              <DetailField label="بداية العهدة" ltr>
                {formatDateTime(row.fromUtc)}
              </DetailField>
              <DetailField label="نهاية العهدة" ltr={row.toUtc !== null}>
                {row.toUtc === null ? '—' : formatDateTime(row.toUtc)}
              </DetailField>
              <DetailField label="سند الصرف المرجعي" ltr>
                <span className="font-mono text-sm">{row.issueDocumentId}</span>
              </DetailField>
            </dl>
          </ContentCard>

          {canTransfer ? (
            <ContentCard
              title="مبادلة مسؤولية العهدة"
              description="تحويل هذه العهدة إلى حائز آخر داخل النطاق؛ يُغلق السطر الحالي ويُفتح سطر جديد للحائز الجديد."
            >
              <TransferCustodyDialog custody={row} />
            </ContentCard>
          ) : null}
        </>
      )}
    </div>
  )
}
