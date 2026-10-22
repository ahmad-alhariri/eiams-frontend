import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useAssetsQuery } from '@/modules/asset/hooks/use-asset-queries'
import { AssetStatusBadge } from '@/modules/asset/components/asset-status-badge'
import { ASSET_STATUSES, ASSET_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import type { Asset, AssetCurrentStatus, ListAssetsQuery } from '@/modules/asset/types/asset.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { formatDate } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

const columnHelper = createColumnHelper<typeof dataTableFeatures, Asset>()

/**
 * Asset registry list page: server-paged registry of every asset within the
 * active scope. The filters — free-text search over asset number / serial /
 * material, warehouse, and the current status — are the live `listAssets`
 * query parameters and nothing else: the server binds `warehouseId`,
 * `materialId`, `status`, `search`, `page` (one-based) and `pageSize`.
 */
export default function AssetRegistryListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AssetCurrentStatus | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearch(query)
      setPage(1)
    },
    [setPage],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as AssetCurrentStatus))
      setPage(1)
    },
    [setPage],
  )

  const handleWarehouseFilterChange = useCallback(
    (value: string | null) => {
      setWarehouseId(value ?? undefined)
      setPage(1)
    },
    [setPage],
  )

  const warehouseSelector = useScopedWarehouseSelector()

  const filters = useMemo<ListAssetsQuery>(
    () => ({
      page,
      pageSize,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(status === undefined ? {} : { status }),
      ...(warehouseId === undefined || warehouseId.trim() === ''
        ? {}
        : { warehouseId: warehouseId.trim() }),
    }),
    [page, pageSize, search, status, warehouseId],
  )

  const assetsQuery = useAssetsQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('assetNumber', {
          id: 'assetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.assetDetail.replace(':assetId', row.original.id)}
            >
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor((asset) => asset.serialNumber ?? '—', {
          id: 'serialNumber',
          header: 'الرقم التسلسلي',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        columnHelper.accessor('materialNameAr', {
          id: 'materialNameAr',
          header: 'المادة',
        }),
        columnHelper.accessor('warehouseName', {
          id: 'warehouseName',
          header: 'المستودع الحالي',
        }),
        columnHelper.accessor('currentStatus', {
          id: 'currentStatus',
          header: 'الحالة',
          cell: ({ getValue }) => <AssetStatusBadge status={getValue()} />,
        }),
        columnHelper.accessor('acquisitionDate', {
          id: 'acquisitionDate',
          header: 'تاريخ الاقتناء',
          // A DateOnly ("2024-03-01") goes through the shared date formatter
          // like every other date in the module.
          cell: ({ getValue }) => <span dir="ltr">{formatDate(getValue())}</span>,
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.assets.labelAr}
        subtitle="سجل الأصول ضمن نطاق العمل الحالي: بحث نصي، تصفية حسب المستودع والحالة الحالية، مع ترقيم من الخادم."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الحالة الحالية</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب الحالة الحالية">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : ASSET_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {ASSET_STATUSES.map((current) => (
                    <SelectItem key={current} value={current}>
                      {ASSET_STATUS_LABELS_AR[current]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">المستودع</span>
              <AsyncSelect
                value={warehouseId ?? null}
                onValueChange={handleWarehouseFilterChange}
                loadOptions={warehouseSelector.loadOptions}
                disabled={!warehouseSelector.scopeReady}
                placeholder="تصفية حسب المستودع..."
                inputProps={{ 'aria-label': 'تصفية حسب المستودع' }}
              />
            </div>
          </div>
        }
      />

      <ContentCard
        title="سجل الأصول"
        description="ابحث برقم الأصل أو الرقم التسلسلي أو اسم المادة، وصفِّ حسب المستودع أو الحالة الحالية. تُنفَّذ النتائج والترقيم في الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(assetsQuery.data, assetsQuery.isError)}
          isLoading={assetsQuery.isLoading}
          isError={assetsQuery.isError}
          onRetry={() => void assetsQuery.refetch()}
          errorTitle="تعذّر تحميل الأصول"
          errorMessage="تعذّر جلب سجل الأصول. حاول مرة أخرى."
          emptyTitle="لا توجد أصول"
          emptyDescription="لم يتم العثور على أصول تطابق معايير البحث الحالية."
          page={page}
          pageSize={pageSize}
          totalCount={assetsQuery.data?.totalItems}
          totalPages={Math.max(assetsQuery.data?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث برقم الأصل أو الرقم التسلسلي..."
        />
      </ContentCard>
    </div>
  )
}
