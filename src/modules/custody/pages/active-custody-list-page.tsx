import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import type { ListCustodiesQuery } from '@/modules/custody/types/custody.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ASSET_DERIVED_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import type { CustodyStatus } from '@/shared/types/generated/eiams-v1'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

/**
 * Active-custody rows are Asset-subject custody rows for this registry view;
 * Material/TrackedUnit subjects surface in their own module views.
 */
interface ActiveCustodyRow {
  readonly assetId: string
  readonly assetNumber: string
  readonly custodyId: string
  readonly custodyKind: 'Operational' | 'Personal'
  readonly fromTs: string
  readonly holder: { readonly displayName: string }
  readonly status: CustodyStatus
}

function toActiveRows(
  page: Readonly<{ items: readonly unknown[] }> | undefined,
): ActiveCustodyRow[] {
  if (page === undefined) return []
  return page.items as ActiveCustodyRow[]
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, ActiveCustodyRow>()

const CUSTODY_STATUS_LABELS_AR: Readonly<Record<CustodyStatus, string>> = {
  Active: 'نشطة',
  Closed: 'مغلقة',
}
const CUSTODY_KIND_LABELS_AR = {
  Operational: 'تشغيلي',
  Personal: 'شخصي',
} as const

/**
 * Active custody list (e19-t04): every custody row within the active scope,
 * filterable by status. Rows link to the custody detail route; the transfer
 * action (t05) composes on the detail page.
 */
export default function ActiveCustodyListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [status, setStatus] = useState<CustodyStatus | undefined>()
  const [search, setSearch] = useState('')
  const { has } = usePermission()

  const filters = useMemo<ListCustodiesQuery>(
    () => ({
      pageIndex: page - 1,
      pageSize,
      ...(status === undefined ? {} : { status }),
      ...(search.trim() === '' ? {} : { search: search.trim() }),
    }),
    [page, pageSize, search, status],
  )

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value)
      setPage(1)
    },
    [setPage],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as CustodyStatus))
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
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor((row) => row.holder.displayName, {
          id: 'holder',
          header: 'الحائز',
        }),
        columnHelper.accessor('custodyKind', {
          id: 'custodyKind',
          header: 'نوع الحفظ',
          cell: ({ getValue }) => CUSTODY_KIND_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('fromTs', {
          id: 'fromTs',
          header: 'منذ',
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

  void has
  void CUSTODY_STATUS_LABELS_AR
  void ASSET_DERIVED_STATUS_LABELS_AR

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyActive.labelAr}
        subtitle="جميع العهد النشطة والمغلقة ضمن نطاق العمل الحالي، مع تصفية حسب الحالة وبحث نصي."
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
                {(Object.keys(CUSTODY_STATUS_LABELS_AR) as CustodyStatus[]).map((value) => (
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
        description="ابحث باسم الحائز أو رقم الأصل، وصفِّ حسب حالة العهدة. تُنفَّذ النتائج والترقيم في الخادم."
      >
        <input
          className="mb-3 h-9 w-full max-w-80 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="ابحث عن حائز أو رقم أصل..."
          aria-label="بحث في العهد"
          value={search}
          onChange={handleSearchChange}
        />
        <DataTableServer
          columns={columns}
          data={toActiveRows(custodiesQuery.data)}
          isLoading={custodiesQuery.isLoading}
          isError={custodiesQuery.isError}
          onRetry={() => void custodiesQuery.refetch()}
          errorTitle="تعذّر تحميل العهد"
          errorMessage="تعذّر جلب قائمة العهد. حاول مرة أخرى."
          emptyTitle="لا توجد عهد"
          emptyDescription="لم يتم العثور على عهد تطابق معايير البحث الحالية."
          page={page}
          pageSize={pageSize}
          totalCount={custodiesQuery.data?.meta.totalItems}
          totalPages={Math.max(custodiesQuery.data?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
    </div>
  )
}
