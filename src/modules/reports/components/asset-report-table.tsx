import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { AssetStatusBadge } from '@/modules/asset/components/asset-status-badge'
import { ASSET_STATUSES, ASSET_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import type { AssetCurrentStatus } from '@/modules/asset/types/asset.types'
import { useAssetReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type { AssetsReportRow, ListAssetReportQuery } from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { ExportButton } from '@/shared/ui/export-button'
import { PrintButton } from '@/shared/ui/print-button'
import { formatNumber } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

const assetColumnHelper = createColumnHelper<typeof dataTableFeatures, AssetsReportRow>()

/**
 * Asset report (`GET /reports/assets`).
 *
 * The live endpoint answers with a per-warehouse SUMMARY: one row per
 * (warehouse, current status) pair carrying the server's asset COUNT
 * (`Application/Reports/Assets/AssetsReportRow.cs:3-8`,
 * `Application/Reports/Assets/GetAssetsReportQueryHandler.cs:37-44`). There is
 * no asset identity, no material and no custodian on the wire, so the table
 * renders what the server sends and nothing more.
 *
 * The controller binds `warehouseId`, `status` and the one-based pagination
 * (`Web.Api/Controllers/Reports/GetAssetsReportController.cs:26-30`) — and NO
 * `search`, so this report offers no search box: a filter the server ignores
 * would be a lie in the UI.
 */
function AssetReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [status, setStatus] = useState<AssetCurrentStatus | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListAssetReportQuery>(
    () => ({
      page: currentPage,
      pageSize,
      ...(status === undefined ? {} : { status }),
      ...(warehouseId === undefined ? {} : { warehouseId }),
    }),
    [currentPage, pageSize, status, warehouseId],
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

  const handleStatusChange = useCallback(
    (value: string | null) => {
      const resolved =
        value === 'all' || value === null
          ? undefined
          : ASSET_STATUSES.find((candidate) => candidate === value)
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
        assetColumnHelper.accessor((row) => row.warehouseName, {
          id: 'Warehouse',
          header: 'المستودع',
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{row.original.warehouseName}</span>
              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                {row.original.warehouseCode}
              </span>
            </div>
          ),
        }),
        assetColumnHelper.accessor('currentStatus', {
          id: 'CurrentStatus',
          header: 'الحالة',
          enableSorting: false,
          cell: ({ getValue }) => <AssetStatusBadge status={getValue()} />,
        }),
        assetColumnHelper.accessor('assetCount', {
          id: 'AssetCount',
          header: 'عدد الأصول',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-semibold text-foreground">
              {formatNumber(getValue())}
            </span>
          ),
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير الأصول والتكليف"
        subtitle="ملخص عدد الأصول لكل مستودع وحالة، يحسبه الخادم. لا يعرض التقرير تفاصيل الأصول."
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
              <span>الحالة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب الحالة">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : ASSET_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {ASSET_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ASSET_STATUS_LABELS_AR[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Report actions — D-RPT-03 §6 informal print + §3 export */}
            <div
              className="col-span-full flex items-center justify-end gap-1"
              role="toolbar"
              aria-label="إجراءات التقرير"
            >
              <PrintButton aria-label="طباعة تقرير الأصول والتكليف" />
              <ExportButton
                reportType="assets"
                requiredPermission="asset.view"
                filters={warehouseId !== undefined ? { warehouseId } : undefined}
                label="تصدير تقرير الأصول والتكليف"
              />
            </div>
          </div>
        }
      />
      <ContentCard
        title="ملخص الأصول"
        description="لكل مستودع وحالة: عدد الأصول الذي يحسبه الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير الأصول"
          errorMessage="تعذّر جلب ملخص الأصول. حاول مرة أخرى."
          emptyTitle="لا توجد أصول"
          emptyDescription="لم يتم العثور على أصول تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.totalItems}
          totalPages={Math.max(page?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
    </div>
  )
}

export function AssetReportTable() {
  return <AssetReportTableImpl />
}
