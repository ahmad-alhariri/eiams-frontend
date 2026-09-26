import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'
import { useCallback, useMemo, useState } from 'react'

import { ROUTE_PATHS } from '@/config/routes'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { stockMovementTypeLabelAr } from '@/modules/inventory/components/stock-movement-labels'
import { useStockMovementsQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import type {
  ListStockMovementsQuery,
  StockMovement,
} from '@/modules/inventory/types/inventory.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatNumber, formatUuid } from '@/shared/utils/format'
import type { StockMovementType } from '@/shared/types/generated/eiams-v1'

const movementColumnHelper = createColumnHelper<typeof dataTableFeatures, StockMovement>()

const MOVEMENT_TYPE_OPTIONS: ReadonlyArray<{ value: StockMovementType; label: string }> = [
  { value: 'Receipt', label: stockMovementTypeLabelAr('Receipt') },
  { value: 'Issue', label: stockMovementTypeLabelAr('Issue') },
  { value: 'TransferIn', label: stockMovementTypeLabelAr('TransferIn') },
  { value: 'TransferOut', label: stockMovementTypeLabelAr('TransferOut') },
  { value: 'AdjustmentIn', label: stockMovementTypeLabelAr('AdjustmentIn') },
  { value: 'AdjustmentOut', label: stockMovementTypeLabelAr('AdjustmentOut') },
  { value: 'Opening', label: stockMovementTypeLabelAr('Opening') },
]

function formatSignedDelta(quantityDelta: number): string {
  const formatted = formatNumber(quantityDelta, { maxFractionDigits: 3 })
  return quantityDelta > 0 ? `+${formatted}` : formatted
}

function toIsoDateTime(value: string): string | undefined {
  if (value === '') return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

/**
 * Stock movement report (e23-t06). The provisional OpenAPI has no
 * `/reports/movements` endpoint; per D-RPT-01 §"V1 contract matrix" the
 * "stock movement report" is the existing immutable inventory-movement
 * ledger presented under the Reports surface. No client-side grouping,
 * totals, renaming of events, or reversal inference — the server owns
 * everything.
 */
function StockMovementReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [materialId, setMaterialId] = useState<string | undefined>()
  const [movementType, setMovementType] = useState<StockMovementType | undefined>()
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')

  const dateFrom = toIsoDateTime(dateFromInput)
  const dateTo = toIsoDateTime(dateToInput)

  const warehouseSelector = useScopedWarehouseSelector()
  const materialSelector = useScopedMaterialSelector(true)

  const query = useMemo<ListStockMovementsQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(materialId === undefined ? {} : { materialId }),
      ...(movementType === undefined ? {} : { movementType }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
    }),
    [currentPage, dateFrom, dateTo, materialId, movementType, pageSize, warehouseId],
  )

  const movementsQuery = useStockMovementsQuery(query)
  const page = movementsQuery.data

  const resetPageAndSet = useCallback(
    <T,>(setter: (value: T) => void, value: T) => {
      setter(value)
      setPage(1)
    },
    [setPage],
  )

  const handleWarehouseChange = useCallback(
    (value: string | null) => resetPageAndSet(setWarehouseId, value ?? undefined),
    [resetPageAndSet],
  )
  const handleMaterialChange = useCallback(
    (value: string | null) => resetPageAndSet(setMaterialId, value ?? undefined),
    [resetPageAndSet],
  )
  const handleMovementTypeChange = useCallback(
    (value: string | null) => {
      const resolved =
        value === null || value === 'all'
          ? undefined
          : MOVEMENT_TYPE_OPTIONS.some((option) => option.value === value)
            ? (value as StockMovementType)
            : undefined
      resetPageAndSet(setMovementType, resolved)
    },
    [resetPageAndSet],
  )
  const handleDateFromChange = useCallback(
    (value: string) => resetPageAndSet(setDateFromInput, value),
    [resetPageAndSet],
  )
  const handleDateToChange = useCallback(
    (value: string) => resetPageAndSet(setDateToInput, value),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      movementColumnHelper.columns([
        movementColumnHelper.accessor('postedAt', {
          id: 'PostedAt',
          header: 'تاريخ الترحيل',
          enableSorting: false,
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
          id: 'Warehouse',
          header: 'المستودع',
          enableSorting: false,
        }),
        movementColumnHelper.accessor((movement) => movement.material.displayName, {
          id: 'Material',
          header: 'المادة',
          enableSorting: false,
        }),
        movementColumnHelper.accessor('movementType', {
          id: 'MovementType',
          header: 'نوع الحركة',
          enableSorting: false,
          cell: ({ getValue }) => stockMovementTypeLabelAr(getValue()),
        }),
        movementColumnHelper.accessor('quantityDelta', {
          id: 'QuantityDelta',
          header: 'الكمية',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span
              dir="ltr"
              className={
                getValue() > 0
                  ? 'font-semibold text-success'
                  : getValue() < 0
                    ? 'font-semibold text-destructive'
                    : 'font-medium text-muted-foreground'
              }
            >
              {formatSignedDelta(getValue())}
            </span>
          ),
        }),
        movementColumnHelper.accessor((row) => row.documentReference ?? '', {
          id: 'DocumentReference',
          header: 'السند',
          enableSorting: false,
          cell: ({ getValue }) =>
            getValue() === '' ? (
              '—'
            ) : (
              <span dir="ltr" className="font-mono text-sm text-muted-foreground">
                {getValue()}
              </span>
            ),
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير حركات المخزون"
        subtitle="سجل الحركات الثابت يُعرض من الخادم. لا يُجمَّع ولا يُجمَع في المتصفح."
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
              <span>المادة</span>
              <AsyncSelect
                value={materialId ?? null}
                onValueChange={handleMaterialChange}
                loadOptions={materialSelector.loadOptions}
                disabled={!materialSelector.scopeReady}
                placeholder="تصفية حسب المادة..."
                inputProps={{ 'aria-label': 'تصفية حسب المادة' }}
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>نوع الحركة</span>
              <Select value={movementType ?? 'all'} onValueChange={handleMovementTypeChange}>
                <SelectTrigger aria-label="تصفية حسب نوع الحركة">
                  <SelectValue>
                    {movementType === undefined
                      ? 'كل الأنواع'
                      : stockMovementTypeLabelAr(movementType)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {MOVEMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>من تاريخ</span>
              <Input
                type="datetime-local"
                value={dateFromInput}
                onChange={(event) => handleDateFromChange(event.currentTarget.value)}
                aria-label="تصفية حسب تاريخ البداية"
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>إلى تاريخ</span>
              <Input
                type="datetime-local"
                value={dateToInput}
                onChange={(event) => handleDateToChange(event.currentTarget.value)}
                aria-label="تصفية حسب تاريخ النهاية"
              />
            </div>
          </div>
        }
      />
      <ContentCard
        title="سجل الحركات"
        description="كل حركة ضمن النطاق الحالي مع نوعها ومرجع السند الذي أنتجها."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, movementsQuery.isError)}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          onRetry={() => void movementsQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير حركات المخزون"
          errorMessage="تعذّر جلب سجل الحركات. حاول مرة أخرى."
          emptyTitle="لا توجد حركات"
          emptyDescription="لم يتم العثور على حركات تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={
            (page as unknown as { totalItems?: number } | undefined)?.totalItems ??
            page?.meta?.totalItems
          }
          totalPages={Math.max(
            (page as unknown as { totalPages?: number } | undefined)?.totalPages ??
              page?.meta?.totalPages ??
              1,
            1,
          )}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
    </div>
  )
}

export function StockMovementReportTable() {
  return <StockMovementReportTableImpl />
}
