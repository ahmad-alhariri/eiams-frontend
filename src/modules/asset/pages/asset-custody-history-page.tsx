import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link, useParams } from 'react-router'

import { useAssetCustodyTimelineQuery } from '@/modules/asset/hooks/use-asset-queries'
import type { AssetCustodyTimelineRow } from '@/modules/asset/types/asset.types'
import { ROUTE_PATHS } from '@/config/routes'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTable } from '@/shared/ui/data-table'
import { Button } from '@/shared/ui/button'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Immutable custody history for one asset (e19-t08 / PRD §12.8 step 3):
 * every custody row ever recorded — operational and personal, active and
 * closed — rendered read-only in reverse chronological order. Custody rows
 * are append-only server-side (CustodyHistory is immutable); this view never
 * mutates.
 *
 * The row type is the handwritten live wire (`AssetCustodyTimelineRow`); the
 * previous generated `AssetCustody` carried an embedded holder object and the
 * `fromTs` / `toTs` names, neither of which the live timeline response uses.
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, AssetCustodyTimelineRow>()

export default function AssetCustodyHistoryPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const timelineQuery = useAssetCustodyTimelineQuery(assetId)
  const timeline = timelineQuery.data ?? []

  const sorted = useMemo(
    () =>
      [...timeline].sort((a, b) => (a.fromUtc < b.fromUtc ? 1 : a.fromUtc > b.fromUtc ? -1 : 0)),
    [timeline],
  )

  const columns = useMemo(
    () =>
      columnHelper.columns([
        // Live row carries `holderType` + `holderId` only — no display name. The
        // counterpart lookup would be a separate request per row; for a
        // read-only ledger the wire values (with a leading type label) are
        // enough until the lookup pipeline is added.
        columnHelper.accessor((row) => `${row.holderType}:${row.holderId}`, {
          id: 'holder',
          header: 'الحائز',
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-xs">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('custodyKind', {
          id: 'custodyKind',
          header: 'نوع الحفظ',
          cell: ({ getValue }) => (getValue() === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'),
        }),
        columnHelper.accessor('fromUtc', {
          id: 'fromUtc',
          header: 'بداية العهدة',
          cell: ({ getValue }) => <span dir="ltr">{formatDateTime(getValue())}</span>,
        }),
        // Custody rows are append-only, so a closed row's end time is the only
        // record of when the asset came back: it must be readable, not inferred.
        columnHelper.accessor('toUtc', {
          id: 'toUtc',
          header: 'نهاية العهدة',
          cell: ({ getValue, row }) => {
            const toUtc = getValue()
            if (row.original.status !== 'Closed' || !toUtc) return '—'
            return <span dir="ltr">{formatDateTime(toUtc)}</span>
          },
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="custody" status={getValue()} />,
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="سجل العهدة غير القابل للتعديل"
        subtitle={
          <Link
            className="font-mono text-sm underline-offset-4 hover:underline"
            to={ROUTE_PATHS.assetDetail.replace(':assetId', assetId ?? '')}
          >
            <span dir="ltr">عودة إلى تفاصيل الأصل</span>
          </Link>
        }
      />
      {timelineQuery.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل سجل العهدة..." />
      ) : timelineQuery.isError ? (
        <ErrorState
          title="تعذّر تحميل سجل العهدة"
          description="تعذّر جلب سجل عهدة هذا الأصل. حاول مرة أخرى."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void timelineQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <ContentCard
          title="سجل العهدة"
          description="جميع سطور العهدة المسجلة لهذا الأصل بترتيب تنازلي زمنياً. السجل للقراءة فقط ولا يجوز تعديله أو حذفه."
        >
          <DataTable
            columns={columns}
            data={sorted}
            isLoading={timelineQuery.isLoading}
            emptyTitle="لا توجد عهد مسجلة"
            emptyDescription="لم يُسجَّل أي سطر عهدة لهذا الأصل بعد."
          />
        </ContentCard>
      )}
    </div>
  )
}
