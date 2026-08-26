import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useAssetsQuery } from '@/modules/asset/hooks/use-asset-queries'
import {
  ASSET_DERIVED_STATUSES,
  ASSET_DERIVED_STATUS_LABELS_AR,
} from '@/modules/asset/asset-status-labels'
import type { ListAssetsQuery } from '@/modules/asset/types/asset.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import type { Asset, AssetDerivedStatus } from '@/shared/types/generated/eiams-v1'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'

const columnHelper = createColumnHelper<typeof dataTableFeatures, Asset>()

/**
 * Asset registry list page (e18-t02): server-paged registry of every asset
 * within the active scope. Filters — free-text search over asset number /
 * serial / material, warehouse, and derived status — mirror the contract's
 * `listAssets` query; rows link to the detail route.
 */
export default function AssetRegistryListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AssetDerivedStatus | undefined>()
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
      setStatus(value === null || value === 'all' ? undefined : (value as AssetDerivedStatus))
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
      pageIndex: page - 1,
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
              to={ROUTE_PATHS.assetDetail.replace(':assetId', row.original.assetId)}
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
        columnHelper.accessor((asset) => asset.material.displayName, {
          id: 'material',
          header: 'المادة',
        }),
        columnHelper.accessor((asset) => asset.currentWarehouse?.displayName ?? '—', {
          id: 'currentWarehouse',
          header: 'المستودع الحالي',
        }),
        columnHelper.accessor('derivedStatus', {
          id: 'derivedStatus',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="asset" status={getValue()} />,
        }),
        columnHelper.accessor('acquisitionDate', {
          id: 'acquisitionDate',
          header: 'تاريخ الاقتناء',
          cell: ({ getValue }) =>
            getValue() === null || getValue() === undefined ? (
              '—'
            ) : (
              <span dir="ltr">{getValue()}</span>
            ),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.assets.labelAr}
        subtitle="سجل الأصول ضمن نطاق العمل الحالي: بحث نصي، تصفية حسب المستودع والحالة المشتقة، مع ترقيم من الخادم."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الحالة المشتقة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب الحالة المشتقة">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : ASSET_DERIVED_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {ASSET_DERIVED_STATUSES.map((derived) => (
                    <SelectItem key={derived} value={derived}>
                      {ASSET_DERIVED_STATUS_LABELS_AR[derived]}
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
        description="ابحث برقم الأصل أو الرقم التسلسلي أو اسم المادة، وصفِّ حسب المستودع أو الحالة المشتقة. تُنفَّذ النتائج والترقيم في الخادم."
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
          totalCount={assetsQuery.data?.meta.totalItems}
          totalPages={Math.max(assetsQuery.data?.meta.totalPages ?? 1, 1)}
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
