import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import {
  ASSET_DERIVED_STATUSES,
  ASSET_DERIVED_STATUS_LABELS_AR,
} from '@/modules/asset/asset-status-labels'
import { useAssetReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type { ListAssetReportQuery } from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'
import type { Asset, AssetDerivedStatus } from '@/shared/types/generated/eiams-v1'

const assetColumnHelper = createColumnHelper<typeof dataTableFeatures, Asset>()

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: AssetDerivedStatus; label: string }> =
  ASSET_DERIVED_STATUSES.map((value) => ({ value, label: ASSET_DERIVED_STATUS_LABELS_AR[value] }))

/**
 * Asset & custody report (e23-t07). Server-paged asset projection; the
 * derived status badge and current custody (if any) come from the contract
 * response and are rendered as-is. The report never joins the custody ledger
 * in the browser — custody remains a separate read surface
 * (D-RPT-01 §"V1 contract matrix", asset & custody row).
 *
 * Status codes that fall outside the contract enum (D-AST-02 set) are
 * rendered as the raw code rather than as an invented Arabic label, in
 * line with D-RPT-01 §"Rejected alternatives".
 */
function AssetReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AssetDerivedStatus | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListAssetReportQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(status === undefined ? {} : { status }),
      ...(warehouseId === undefined ? {} : { warehouseId }),
    }),
    [currentPage, pageSize, search, status, warehouseId],
  )

  const reportQuery = useAssetReportQuery(queryInput)
  const page = reportQuery.data

  const resetPageAndSet = useCallback(
    <T,>(setter: (value: T) => void, value: T) => {
      setter(value)
      setPage(1)
    },
    [setPage],
  )

  const handleSearchChange = useCallback(
    (nextSearch: string) => resetPageAndSet(setSearch, nextSearch),
    [resetPageAndSet],
  )
  const handleStatusChange = useCallback(
    (value: string | null) => {
      const resolved = value === 'all' || value === null ? undefined : (value as AssetDerivedStatus)
      resetPageAndSet(setStatus, resolved)
    },
    [resetPageAndSet],
  )
  const handleWarehouseChange = useCallback(
    (value: string | null) => resetPageAndSet(setWarehouseId, value ?? undefined),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      assetColumnHelper.columns([
        assetColumnHelper.accessor('assetNumber', {
          id: 'AssetNumber',
          header: 'رقم الأصل',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-sm font-semibold text-foreground">
              {getValue()}
            </span>
          ),
        }),
        assetColumnHelper.accessor((asset) => asset.material.displayName, {
          id: 'Material',
          header: 'المادة',
          enableSorting: false,
        }),
        assetColumnHelper.accessor((asset) => asset.currentWarehouse?.displayName ?? '—', {
          id: 'CurrentWarehouse',
          header: 'المستودع الحالي',
          enableSorting: false,
        }),
        assetColumnHelper.accessor('derivedStatus', {
          id: 'DerivedStatus',
          header: 'الحالة المشتقة',
          enableSorting: false,
          cell: ({ getValue }) => <StatusBadge entity="asset" status={getValue()} />,
        }),
        assetColumnHelper.accessor((asset) => asset.currentCustody?.holder.displayName ?? '—', {
          id: 'CurrentCustodian',
          header: 'المكلف الحالي',
          enableSorting: false,
        }),
        assetColumnHelper.accessor('acquisitionDate', {
          id: 'AcquisitionDate',
          header: 'تاريخ الاقتناء',
          enableSorting: false,
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير الأصول والتكليف"
        subtitle="قراءة فقط، تعتمد على الخادم. لا يتم جمع التكليف مع الأصل في المتصفح."
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>المستودع</span>
              <AsyncSelect
                value={warehouseId ?? null}
                onValueChange={handleWarehouseChange}
                loadOptions={warehouseSelector.loadOptions}
                disabled={!warehouseSelector.scopeReady}
                placeholder="تصفية حسب المستودع..."
                inputProps={{ 'aria-label': 'تصفية حسب المستودع' }}
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>الحالة المشتقة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب الحالة">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : ASSET_DERIVED_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />
      <ContentCard
        title="قائمة الأصول"
        description="كل أصل ضمن النطاق الحالي مع حالته المشتقة والتكليف الحالي."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير الأصول"
          errorMessage="تعذّر جلب قائمة الأصول. حاول مرة أخرى."
          emptyTitle="لا توجد أصول"
          emptyDescription="لم يتم العثور على أصول تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في تقرير الأصول..."
        />
      </ContentCard>
    </div>
  )
}

export function AssetReportTable() {
  return <AssetReportTableImpl />
}
