import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { CustodyStatusBadge } from '@/modules/custody/components/custody-status-badge'
import { CUSTODY_STATUS_LABELS_AR } from '@/modules/custody/custody-status-labels'
import type { Custody, ListCustodiesQuery } from '@/modules/custody/types/custody.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Active-custody rows are Asset-subject custody rows for this registry view;
 * Material/TrackedUnit subjects surface in their own module views.
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, Custody>()

/** The two statuses an Asset-subject custody row can carry. */
const ASSET_CUSTODY_STATUSES = ['Active', 'Closed'] as const

/**
 * Active custody list: every Asset-subject custody row within the active
 * scope, filterable by status. Rows link to the custody detail route; the
 * transfer action composes on the detail page.
 *
 * The live `GET /custodies` binds `holderType`, `holderId`, `materialId`,
 * `subjectType`, `status`, `warehouseId`, `page` and `pageSize` — and
 * NOTHING else: it has no `search` and no `custodyKind`, so the list offers
 * no search box and no custody-kind filter.
 */
export default function ActiveCustodyListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [status, setStatus] = useState<'Active' | 'Closed' | undefined>()

  const filters = useMemo<ListCustodiesQuery>(
    () => ({
      page,
      pageSize,
      subjectType: 'Asset',
      ...(status === undefined ? {} : { status }),
    }),
    [page, pageSize, status],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as 'Active' | 'Closed'))
      setPage(1)
    },
    [setPage],
  )

  const custodiesQuery = useCustodiesQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('assetNumber', {
          id: 'assetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.custodyDetail.replace(':custodyId', row.original.custodyId)}
            >
              <span dir="ltr">{getValue() ?? '—'}</span>
            </Link>
          ),
        }),
        columnHelper.accessor('holderDisplayName', {
          id: 'holderDisplayName',
          header: 'الحائز',
        }),
        columnHelper.accessor('custodyKind', {
          id: 'custodyKind',
          header: 'نوع الحفظ',
          cell: ({ getValue }) => (getValue() === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'),
        }),
        columnHelper.accessor('fromUtc', {
          id: 'fromUtc',
          header: 'منذ',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {formatDateTime(getValue())}
            </span>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <CustodyStatusBadge status={getValue()} />,
        }),
        columnHelper.display({
          id: 'detailLink',
          header: '',
          cell: ({ row }) => (
            <Link
              className="text-sm text-primary underline-offset-4 hover:underline"
              to={ROUTE_PATHS.custodyDetail.replace(':custodyId', row.original.custodyId)}
            >
              عرض التفاصيل
            </Link>
          ),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyActive.labelAr}
        subtitle="جميع عهد الأصول النشطة والمغلقة ضمن نطاق العمل الحالي، مع تصفية حسب الحالة."
        toolbar={
          <div className="flex min-w-44 flex-col gap-2">
            <span className="text-sm font-medium text-foreground">حالة العهدة</span>
            <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
              <SelectTrigger aria-label="تصفية حسب حالة العهدة">
                <SelectValue>
                  {status === undefined ? 'كل الحالات' : CUSTODY_STATUS_LABELS_AR[status]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {ASSET_CUSTODY_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CUSTODY_STATUS_LABELS_AR[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <ContentCard
        title="قائمة العهد"
        description="عهد الأصول المسجّلة في نطاق العمل الحالي، مفلترة حسب حالة العهدة. تُنفَّذ النتائج والترقيم في الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(custodiesQuery.data, custodiesQuery.isError)}
          isLoading={custodiesQuery.isLoading}
          isError={custodiesQuery.isError}
          onRetry={() => void custodiesQuery.refetch()}
          errorTitle="تعذّر تحميل العهد"
          errorMessage="تعذّر جلب قائمة العهد. حاول مرة أخرى."
          emptyTitle="لا توجد عهد"
          emptyDescription="لم يتم العثور على عهد تطابق معايير التصفية الحالية."
          page={page}
          pageSize={pageSize}
          totalCount={custodiesQuery.data?.totalItems}
          totalPages={Math.max(custodiesQuery.data?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
    </div>
  )
}
