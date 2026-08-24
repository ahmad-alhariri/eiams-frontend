import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link, useParams } from 'react-router'

import { useAssetCustodyTimelineQuery } from '@/modules/asset/hooks/use-asset-queries'
import { ROUTE_PATHS } from '@/config/routes'
import type { AssetCustody } from '@/shared/types/generated/eiams-v1'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTable } from '@/shared/ui/data-table'

/**
 * Immutable custody history for one asset (e19-t08 / PRD §12.8 step 3):
 * every custody row ever recorded — operational and personal, active and
 * closed — rendered read-only in reverse chronological order. Custody rows
 * are append-only server-side (CustodyHistory is immutable); this view never
 * mutates.
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, AssetCustody>()

export default function AssetCustodyHistoryPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const timelineQuery = useAssetCustodyTimelineQuery(assetId)
  const timeline = timelineQuery.data ?? []

  const sorted = useMemo(
    () => [...timeline].sort((a, b) => (a.fromTs < b.fromTs ? 1 : a.fromTs > b.fromTs ? -1 : 0)),
    [timeline],
  )

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.holder.displayName, {
          id: 'holder',
          header: 'الحائز',
        }),
        columnHelper.accessor('custodyKind', {
          id: 'custodyKind',
          header: 'نوع الحفظ',
          cell: ({ getValue }) => (getValue() === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'),
        }),
        columnHelper.accessor('fromTs', {
          id: 'fromTs',
          header: 'بداية العهدة',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {getValue()}
            </span>
          ),
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
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => void timelineQuery.refetch()}
            >
              إعادة المحاولة
            </button>
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
