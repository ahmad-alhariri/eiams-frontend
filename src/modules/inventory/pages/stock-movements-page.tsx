import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { stockMovementTypeLabelAr } from '@/modules/inventory/components/stock-movement-labels'
import { useStockMovementsQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import type { ListStockMovementsQuery } from '@/modules/inventory/types/inventory.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, type DataTableSortState } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatIdentifier, formatNumber, formatUuid } from '@/shared/utils/format'
import type {
  StockMovement,
  StockMovementSortField,
  StockMovementType,
} from '@/shared/types/generated/eiams-v1'

const movementColumnHelper = createColumnHelper<typeof dataTableFeatures, StockMovement>()

const MOVEMENT_SORT_FIELDS = [
  'PostedAt',
  'WarehouseDisplayName',
  'MaterialDisplayName',
  'MovementType',
  'QuantityDelta',
] as const satisfies readonly StockMovementSortField[]

const MOVEMENT_TYPE_OPTIONS: readonly StockMovementType[] = [
  'Receipt',
  'Issue',
  'TransferIn',
  'TransferOut',
  'AdjustmentIn',
  'AdjustmentOut',
  'Opening',
]

function isMovementSortField(value: string): value is StockMovementSortField {
  return (MOVEMENT_SORT_FIELDS as readonly string[]).includes(value)
}

function toIsoDateTime(value: string): string | undefined {
  if (value === '') {
    return undefined
  }

  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function formatSignedDelta(quantityDelta: number): string {
  const formatted = formatNumber(quantityDelta, { maxFractionDigits: 3 })
  return quantityDelta > 0 ? `+${formatted}` : formatted
}

type FilterFieldProps = {
  children: ReactNode
  label: string
}

function FilterField({ children, label }: FilterFieldProps) {
  return (
    <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </div>
  )
}

/**
 * Immutable, server-paginated stock ledger. All filtering, ordering, scope,
 * and row construction are delegated to the inventory read contract.
 */
function StockMovementsPage() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [materialId, setMaterialId] = useState<string | undefined>()
  const [movementType, setMovementType] = useState<StockMovementType | undefined>()
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')
  const [sortBy, setSortBy] = useState<StockMovementSortField>('PostedAt')
  const [sortDirection, setSortDirection] = useState<'Ascending' | 'Descending'>('Descending')
  const warehouseSelector = useScopedWarehouseSelector()
  const materialSelector = useScopedMaterialSelector(true)
  const dateFrom = toIsoDateTime(dateFromInput)
  const dateTo = toIsoDateTime(dateToInput)

  const query = useMemo<ListStockMovementsQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      sortBy,
      sortDirection,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(materialId === undefined ? {} : { materialId }),
      ...(movementType === undefined ? {} : { movementType }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
    }),
    [
      currentPage,
      dateFrom,
      dateTo,
      materialId,
      movementType,
      pageSize,
      sortBy,
      sortDirection,
      warehouseId,
    ],
  )
  const movementsQuery = useStockMovementsQuery(query)

  const resetPage = useCallback(() => setPage(1), [setPage])

  const handleSortChange = useCallback(
    (next: DataTableSortState | null) => {
      if (next === null || !isMovementSortField(next.id)) {
        return
      }
      setSortBy(next.id)
      setSortDirection(next.direction === 'asc' ? 'Ascending' : 'Descending')
      resetPage()
    },
    [resetPage],
  )

  const handleWarehouseChange = useCallback(
    (value: string | null) => {
      setWarehouseId(value ?? undefined)
      resetPage()
    },
    [resetPage],
  )

  const handleMaterialChange = useCallback(
    (value: string | null) => {
      setMaterialId(value ?? undefined)
      resetPage()
    },
    [resetPage],
  )

  const handleMovementTypeChange = useCallback(
    (value: string | null) => {
      setMovementType(
        value !== null && MOVEMENT_TYPE_OPTIONS.includes(value as StockMovementType)
          ? (value as StockMovementType)
          : undefined,
      )
      resetPage()
    },
    [resetPage],
  )

  const handleDateFromChange = useCallback(
    (value: string) => {
      setDateFromInput(value)
      resetPage()
    },
    [resetPage],
  )

  const handleDateToChange = useCallback(
    (value: string) => {
      setDateToInput(value)
      resetPage()
    },
    [resetPage],
  )

  const clearFilters = useCallback(() => {
    setWarehouseId(undefined)
    setMaterialId(undefined)
    setMovementType(undefined)
    setDateFromInput('')
    setDateToInput('')
    resetPage()
  }, [resetPage])

  const columns = useMemo(
    () =>
      movementColumnHelper.columns([
        movementColumnHelper.accessor('postedAt', {
          id: 'PostedAt',
          header: 'تاريخ الترحيل',
          cell: ({ getValue, row }) => (
            <Link
              to={ROUTE_PATHS.inventoryMovementDetail.replace(
                ':movementId',
                row.original.movementId,
              )}
              aria-label={`عرض تفاصيل حركة ${formatUuid(row.original.movementId)}`}
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span dir="rtl">{formatDateTime(getValue())}</span>
            </Link>
          ),
        }),
        movementColumnHelper.accessor((movement) => movement.warehouse.displayName, {
          id: 'WarehouseDisplayName',
          header: 'المستودع',
        }),
        movementColumnHelper.accessor((movement) => movement.material.displayName, {
          id: 'MaterialDisplayName',
          header: 'المادة',
        }),
        movementColumnHelper.accessor('movementType', {
          id: 'MovementType',
          header: 'نوع الحركة',
          cell: ({ getValue }) => (
            <Badge variant="outline">{stockMovementTypeLabelAr(getValue())}</Badge>
          ),
        }),
        movementColumnHelper.accessor('quantityDelta', {
          id: 'QuantityDelta',
          header: 'التغير في الرصيد',
          cell: ({ getValue }) => (
            <span
              dir="ltr"
              className={
                getValue() < 0 ? 'font-semibold text-destructive' : 'font-semibold text-success'
              }
            >
              {formatSignedDelta(getValue())}
            </span>
          ),
        }),
        movementColumnHelper.accessor('documentReference', {
          id: 'documentReference',
          header: 'مرجع المستند',
          enableSorting: false,
          cell: ({ getValue }) => {
            const documentReference = getValue()
            return (
              <span dir="ltr">{documentReference ? formatIdentifier(documentReference) : '—'}</span>
            )
          },
        }),
        movementColumnHelper.accessor((movement) => movement.postedBy.displayName, {
          id: 'postedBy',
          header: 'رُحّلت بواسطة',
          enableSorting: false,
        }),
      ]),
    [],
  )

  const tableSortState: DataTableSortState = {
    id: sortBy,
    direction: sortDirection === 'Ascending' ? 'asc' : 'desc',
  }
  const page = movementsQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="حركات المخزون"
        subtitle="سجل حركات غير قابل للتعديل؛ يعرض الخادم الحركات ضمن نطاق العمل ويملك التصفية والترتيب والترقيم."
        toolbar={
          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FilterField label="المستودع">
              <AsyncSelect
                value={warehouseId ?? null}
                onValueChange={(value) => handleWarehouseChange(value)}
                loadOptions={warehouseSelector.loadOptions}
                disabled={!warehouseSelector.scopeReady}
                placeholder="ابحث عن مستودع..."
                inputProps={{ 'aria-label': 'تصفية حسب المستودع' }}
              />
            </FilterField>
            <FilterField label="المادة">
              <AsyncSelect
                value={materialId ?? null}
                onValueChange={(value) => handleMaterialChange(value)}
                loadOptions={materialSelector.loadOptions}
                disabled={!materialSelector.scopeReady}
                placeholder="ابحث عن مادة..."
                inputProps={{ 'aria-label': 'تصفية حسب المادة' }}
              />
            </FilterField>
            <FilterField label="نوع الحركة">
              <Select value={movementType ?? 'all'} onValueChange={handleMovementTypeChange}>
                <SelectTrigger aria-label="تصفية حسب نوع الحركة">
                  <SelectValue>
                    {movementType === undefined
                      ? 'كل الحركات'
                      : stockMovementTypeLabelAr(movementType)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحركات</SelectItem>
                  {MOVEMENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {stockMovementTypeLabelAr(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="من تاريخ الترحيل">
              <Input
                type="datetime-local"
                aria-label="من تاريخ الترحيل"
                value={dateFromInput}
                onChange={(event) => handleDateFromChange(event.currentTarget.value)}
              />
            </FilterField>
            <FilterField label="إلى تاريخ الترحيل">
              <Input
                type="datetime-local"
                aria-label="إلى تاريخ الترحيل"
                value={dateToInput}
                onChange={(event) => handleDateToChange(event.currentTarget.value)}
              />
            </FilterField>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={clearFilters}>
                مسح عوامل التصفية
              </Button>
            </div>
          </div>
        }
      />

      <ContentCard
        title="سجل الحركات"
        description="كل صف يمثل حركة مخزون ثابتة أنشأها الخادم من مستند مُرحّل؛ لا يمكن تعديل السجل من هذه الشاشة."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, movementsQuery.isError)}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          onRetry={() => void movementsQuery.refetch()}
          errorTitle="تعذّر تحميل حركات المخزون"
          errorMessage="تعذّر جلب سجل الحركات من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          emptyTitle="لا توجد حركات مخزون"
          emptyDescription="لم يتم العثور على حركات تطابق عوامل التصفية الحالية ضمن نطاق العمل."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          sort={{ sortState: tableSortState, onSortChange: handleSortChange }}
        />
      </ContentCard>
    </div>
  )
}

export default StockMovementsPage
