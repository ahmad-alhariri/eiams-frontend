import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useInventoryReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type {
  InventoryReportRow,
  ListInventoryReportQuery,
} from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { ExportButton } from '@/shared/ui/export-button'
import { PrintButton } from '@/shared/ui/print-button'
import { formatDateTime, formatNumber } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

const balanceColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryReportRow>()

/**
 * Inventory balance report (e23-t05). `GET /reports/inventory` returns a
 * per-material SUMMARY (`materialId`, `materialCode`, `materialNameAr`,
 * `totalQuantity`, `warehouseCount`, `lastUpdatedUtc`), not a balance list —
 * see `Application/Reports/Inventory/InventoryReportRow.cs`.
 *
 * The only filters forwarded to the contract are `warehouseId` and `search`;
 * pagination is translated to the controller's one-based `page`.
 */
function InventoryBalanceReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState<string | undefined>()

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListInventoryReportQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(warehouseId === undefined ? {} : { warehouseId }),
    }),
    [currentPage, pageSize, search, warehouseId],
  )

  const reportQuery = useInventoryReportQuery(queryInput)
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
  const handleWarehouseChange = useCallback(
    (value: string | null) => resetPageAndSet(setWarehouseId, value ?? undefined),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      balanceColumnHelper.columns([
        balanceColumnHelper.accessor('materialCode', {
          id: 'MaterialCode',
          header: 'رمز المادة',
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-sm text-muted-foreground">
              {getValue()}
            </span>
          ),
        }),
        balanceColumnHelper.accessor('materialNameAr', {
          id: 'MaterialNameAr',
          header: 'المادة',
          cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
        }),
        balanceColumnHelper.accessor('totalQuantity', {
          id: 'TotalQuantity',
          header: 'إجمالي الكمية',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-semibold text-foreground">
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </span>
          ),
        }),
        balanceColumnHelper.accessor('warehouseCount', {
          id: 'WarehouseCount',
          header: 'عدد المستودعات',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        balanceColumnHelper.accessor('lastUpdatedUtc', {
          id: 'LastUpdated',
          header: 'آخر تحديث',
          enableSorting: false,
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير أرصدة المخزون"
        subtitle="ملخص لكل مادة ضمن نطاق العمل الحالي. تُنفَّذ التصفية والترقيم في الخادم."
        toolbar={
          <div className="flex items-center gap-3">
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

            {/* Report actions — D-RPT-03 §6 informal print + §3 export */}
            <div className="flex items-center gap-1" role="toolbar" aria-label="إجراءات التقرير">
              <PrintButton aria-label="طباعة تقرير أرصدة المخزون" />
              <ExportButton
                reportType="inventory"
                requiredPermission="inventory.view"
                filters={warehouseId !== undefined ? { warehouseId } : undefined}
                label="تصدير تقرير أرصدة المخزون"
              />
            </div>
          </div>
        }
      />
      <ContentCard
        title="ملخص الأرصدة حسب المادة"
        description="لكل مادة: إجمالي الكمية وعدد المستودعات وآخر تحديث، كما يحسبها الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير أرصدة المخزون"
          errorMessage="تعذّر جلب ملخص الأرصدة. حاول مرة أخرى."
          emptyTitle="لا توجد أرصدة مخزون"
          emptyDescription="لم يتم العثور على أرصدة تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في التقرير..."
        />
      </ContentCard>
    </div>
  )
}

export function InventoryBalanceReportTable() {
  return <InventoryBalanceReportTableImpl />
}
