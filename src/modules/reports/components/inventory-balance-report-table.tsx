import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useInventoryReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type { ListInventoryReportQuery } from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { InventoryLowStockBadge } from '@/modules/inventory/components/inventory-low-stock-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { formatDateTime, formatNumber } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'
import type { InventoryBalance } from '@/shared/types/generated/eiams-v1'

const balanceColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryBalance>()

/**
 * Inventory balance report (e23-t05). Server-owned balances, server-paged.
 * The only filters forwarded to the contract are `pageIndex`, `pageSize`,
 * `warehouseId`, and `search` — anything else would alter server scope or
 * query semantics without a versioned contract (D-RPT-01 §"V1 contract
 * matrix", inventory balance report row).
 *
 * The page resets `pageIndex` to 0 on any allowed filter change so a filtered
 * result never lands the user on an empty out-of-range page.
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
        balanceColumnHelper.accessor((balance) => balance.warehouse.displayName, {
          id: 'WarehouseDisplayName',
          header: 'المستودع',
          cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
        }),
        balanceColumnHelper.accessor((balance) => balance.material.displayName, {
          id: 'MaterialDisplayName',
          header: 'المادة',
          cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
        }),
        balanceColumnHelper.accessor('quantity', {
          id: 'Quantity',
          header: 'الرصيد',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </span>
          ),
        }),
        balanceColumnHelper.accessor('lowStock', {
          id: 'LowStock',
          header: 'حالة التنبيه',
          enableSorting: false,
          cell: ({ getValue }) => (
            <InventoryLowStockBadge
              state={getValue().state}
              thresholdQuantity={getValue().thresholdQuantity}
            />
          ),
        }),
        balanceColumnHelper.accessor('lastUpdated', {
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
        subtitle="عرض الأرصدة ضمن نطاق العمل الحالي. تُنفَّذ التصفية والترقيم في الخادم."
        toolbar={
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
        }
      />
      <ContentCard
        title="قائمة الأرصدة"
        description="ابحث في التقرير ثم تصفَّح النتائج المرحَّلة من الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير أرصدة المخزون"
          errorMessage="تعذّر جلب قائمة الأرصدة. حاول مرة أخرى."
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
