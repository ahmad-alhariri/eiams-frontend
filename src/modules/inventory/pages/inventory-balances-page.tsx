import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { InventoryLowStockBadge } from '@/modules/inventory/components/inventory-low-stock-badge'
import { useInventoryBalancesQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import type { ListInventoryBalancesQuery } from '@/modules/inventory/types/inventory.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { dataTableFeatures, type DataTableSortState } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { formatDateTime, formatNumber } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'
import type {
  InventoryBalance,
  InventoryBalanceSortField,
  InventoryLowStockState,
  SortDirection,
} from '@/shared/types/generated/eiams-v1'

const balanceColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryBalance>()

const LOW_STOCK_FILTER_OPTIONS: ReadonlyArray<{
  label: string
  value: InventoryLowStockState
}> = [
  { value: 'Low', label: 'منخفض' },
  { value: 'Sufficient', label: 'الرصيد كافٍ' },
  { value: 'NotConfigured', label: 'حدّ التنبيه غير محدد' },
  { value: 'Disabled', label: 'تنبيه الانخفاض معطّل' },
]

const TABLE_DIRECTION_TO_CONTRACT: Readonly<
  Record<DataTableSortState['direction'], SortDirection>
> = {
  asc: 'Ascending',
  desc: 'Descending',
}

const CONTRACT_DIRECTION_TO_TABLE: Readonly<
  Record<SortDirection, DataTableSortState['direction']>
> = {
  Ascending: 'asc',
  Descending: 'desc',
}

function isBalanceSortField(value: string): value is InventoryBalanceSortField {
  return (
    value === 'WarehouseDisplayName' ||
    value === 'MaterialDisplayName' ||
    value === 'Quantity' ||
    value === 'LastUpdated'
  )
}

/**
 * Scoped, server-paginated inventory balances. Filtering, sorting, threshold
 * interpretation, and permission enforcement are owned by the API contract.
 */
function InventoryBalancesPage() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [materialId, setMaterialId] = useState<string | undefined>()
  const [lowStockState, setLowStockState] = useState<InventoryLowStockState | undefined>()
  const [sortBy, setSortBy] = useState<InventoryBalanceSortField>('WarehouseDisplayName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('Ascending')

  const warehouseSelector = useScopedWarehouseSelector()
  // Inventory reads include Asset balances too; the document quantity editor's
  // default exclusion is not applicable to a read-only balance filter.
  const materialSelector = useScopedMaterialSelector(true)

  const queryInput = useMemo<ListInventoryBalancesQuery>(
    () => ({
      // DataTable controls are 1-based while EIAMS list operations are 0-based.
      pageIndex: currentPage - 1,
      pageSize,
      sortBy,
      sortDirection,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(materialId === undefined ? {} : { materialId }),
      ...(lowStockState === undefined ? {} : { lowStockState }),
    }),
    [currentPage, lowStockState, materialId, pageSize, search, sortBy, sortDirection, warehouseId],
  )
  const balancesQuery = useInventoryBalancesQuery(queryInput)

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
  const handleMaterialChange = useCallback(
    (value: string | null) => resetPageAndSet(setMaterialId, value ?? undefined),
    [resetPageAndSet],
  )
  const handleLowStockStateChange = useCallback(
    (value: string | null) =>
      resetPageAndSet(
        setLowStockState,
        LOW_STOCK_FILTER_OPTIONS.some((option) => option.value === value)
          ? (value as InventoryLowStockState)
          : undefined,
      ),
    [resetPageAndSet],
  )
  const handleSortChange = useCallback(
    (next: DataTableSortState | null) => {
      if (next === null || !isBalanceSortField(next.id)) return
      setSortBy(next.id)
      setSortDirection(TABLE_DIRECTION_TO_CONTRACT[next.direction])
      setPage(1)
    },
    [setPage],
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
          cell: ({ getValue, row }) => (
            <Link
              dir="ltr"
              aria-label={`عرض تفاصيل رصيد ${row.original.material.displayName} في ${row.original.warehouse.displayName}`}
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.inventoryBalanceDetail.replace(':balanceId', row.original.balanceId)}
            >
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </Link>
          ),
        }),
        balanceColumnHelper.accessor('lowStock', {
          id: 'lowStock',
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
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
      ]),
    [],
  )

  const page = balancesQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="أرصدة المخزون"
        subtitle="عرض الأرصدة ضمن نطاق العمل الحالي. تُنفَّذ التصفية والترتيب والترقيم في الخادم."
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">المستودع</span>
              <AsyncSelect
                value={warehouseId ?? null}
                onValueChange={handleWarehouseChange}
                loadOptions={warehouseSelector.loadOptions}
                disabled={!warehouseSelector.scopeReady}
                placeholder="تصفية حسب المستودع..."
                inputProps={{ 'aria-label': 'تصفية حسب المستودع' }}
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">المادة</span>
              <AsyncSelect
                value={materialId ?? null}
                onValueChange={handleMaterialChange}
                loadOptions={materialSelector.loadOptions}
                disabled={!materialSelector.scopeReady}
                placeholder="تصفية حسب المادة..."
                inputProps={{ 'aria-label': 'تصفية حسب المادة' }}
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">حالة التنبيه</span>
              <Select value={lowStockState ?? 'all'} onValueChange={handleLowStockStateChange}>
                <SelectTrigger aria-label="تصفية حسب حالة التنبيه">
                  <SelectValue>
                    {lowStockState === undefined
                      ? 'كل الحالات'
                      : LOW_STOCK_FILTER_OPTIONS.find((option) => option.value === lowStockState)
                          ?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {LOW_STOCK_FILTER_OPTIONS.map((option) => (
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
        title="قائمة الأرصدة"
        description="ابحث باسم المستودع أو المادة، ثم صفِّ النتائج حسب المستودع أو المادة أو حالة التنبيه."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, balancesQuery.isError)}
          isLoading={balancesQuery.isLoading}
          isError={balancesQuery.isError}
          onRetry={() => void balancesQuery.refetch()}
          errorTitle="تعذّر تحميل أرصدة المخزون"
          errorMessage="تعذّر جلب قائمة الأرصدة. حاول مرة أخرى."
          emptyTitle="لا توجد أرصدة مخزون"
          emptyDescription="لم يتم العثور على أرصدة تطابق معايير البحث الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث باسم المستودع أو المادة..."
          sort={{
            sortState: { id: sortBy, direction: CONTRACT_DIRECTION_TO_TABLE[sortDirection] },
            onSortChange: handleSortChange,
          }}
        />
      </ContentCard>
    </div>
  )
}

export default InventoryBalancesPage
