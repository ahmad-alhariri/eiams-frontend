import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useCountAdjustmentReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type {
  CountAdjustmentsReportRow,
  ListCountAdjustmentReportQuery,
} from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { DatePicker } from '@/shared/ui/date-picker'
import { AsyncSelect } from '@/shared/ui/async-select'
import { ExportButton } from '@/shared/ui/export-button'
import { PrintButton } from '@/shared/ui/print-button'
import { pageRows } from '@/shared/utils/table-data'
import { formatNumber } from '@/shared/utils/format'

const adjustmentColumnHelper = createColumnHelper<
  typeof dataTableFeatures,
  CountAdjustmentsReportRow
>()

/**
 * Count & adjustment report (`GET /reports/count-adjustments`).
 *
 * The live endpoint answers with a per-warehouse SUMMARY: the counts, the
 * variance and the adjustment counters the server computed for that warehouse
 * inside the requested window
 * (`Application/Reports/CountAdjustments/CountAdjustmentsReportRow.cs:3-13`).
 * The frontend renders those numbers; it never recomputes a variance and never
 * matches a count to an adjustment.
 *
 * The controller binds `warehouseId`, `fromUtc`, `toUtc` and the one-based
 * pagination (`Web.Api/Controllers/Reports/GetCountAdjustmentsReportController.cs:25-30`).
 */
function CountAdjustmentReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const dateFromIso = dateFrom ? dateFrom.toISOString() : undefined
  const dateToIso = dateTo ? dateTo.toISOString() : undefined

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListCountAdjustmentReportQuery>(
    () => ({
      page: currentPage,
      pageSize,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(dateFromIso === undefined ? {} : { fromUtc: dateFromIso }),
      ...(dateToIso === undefined ? {} : { toUtc: dateToIso }),
    }),
    [currentPage, dateFromIso, dateToIso, pageSize, warehouseId],
  )

  const reportQuery = useCountAdjustmentReportQuery(queryInput)
  const page = reportQuery.data

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

  const handleDateFromChange = useCallback(
    (date: Date | undefined) => resetPageAndSet(setDateFrom, date),
    [resetPageAndSet],
  )

  const handleDateToChange = useCallback(
    (date: Date | undefined) => resetPageAndSet(setDateTo, date),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      adjustmentColumnHelper.columns([
        adjustmentColumnHelper.accessor((row) => row.warehouseName, {
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
        adjustmentColumnHelper.accessor('countCount', {
          id: 'CountCount',
          header: 'عدد الجرد',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        adjustmentColumnHelper.accessor('closedCountCount', {
          id: 'ClosedCountCount',
          header: 'الجرد المغلق',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        adjustmentColumnHelper.accessor('varianceLineCount', {
          id: 'VarianceLineCount',
          header: 'أسطر الفروقات',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        adjustmentColumnHelper.accessor('netVariance', {
          id: 'NetVariance',
          header: 'صافي الفروقات',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-semibold text-foreground">
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </span>
          ),
        }),
        adjustmentColumnHelper.accessor('adjustmentCount', {
          id: 'AdjustmentCount',
          header: 'عدد التسويات',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        adjustmentColumnHelper.accessor('postedAdjustmentCount', {
          id: 'PostedAdjustmentCount',
          header: 'التسويات المرحلة',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        adjustmentColumnHelper.accessor('adjustmentDifference', {
          id: 'AdjustmentDifference',
          header: 'فرق التسويات',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-semibold text-foreground">
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </span>
          ),
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير الجرد والتسويات"
        subtitle="ملخص لكل مستودع: الجرد والفروقات والتسويات كما يحسبها الخادم. لا يحتسب المتصفح الفروقات ولا يطابق الجرد مع التسويات."
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
              <span>من تاريخ</span>
              <DatePicker
                key="date-from"
                ariaLabel="تصفية حسب تاريخ البداية"
                onChange={handleDateFromChange}
              />
            </div>
            <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
              <span>إلى تاريخ</span>
              <DatePicker
                key="date-to"
                ariaLabel="تصفية حسب تاريخ النهاية"
                onChange={handleDateToChange}
              />
            </div>

            {/* Report actions — D-RPT-03 §6 informal print + §3 export */}
            <div
              className="col-span-full flex items-center justify-end gap-1"
              role="toolbar"
              aria-label="إجراءات التقرير"
            >
              <PrintButton aria-label="طباعة تقرير الجرد والتسويات" />
              <ExportButton
                reportType="count-adjustments"
                requiredPermission="inventory.view"
                filters={
                  warehouseId !== undefined
                    ? {
                        ...(dateFromIso !== undefined ? { dateFrom: dateFromIso } : {}),
                        ...(dateToIso !== undefined ? { dateTo: dateToIso } : {}),
                        warehouseId,
                      }
                    : undefined
                }
                label="تصدير تقرير الجرد والتسويات"
              />
            </div>
          </div>
        }
      />
      <ContentCard
        title="ملخص الجرد والتسويات"
        description="لكل مستودع: عدد الجرد والفروقات والتسويات كما يحسبها الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير الجرد والتسويات"
          errorMessage="تعذّر جلب ملخص الجرد والتسويات. حاول مرة أخرى."
          emptyTitle="لا توجد تسويات"
          emptyDescription="لم يتم العثور على تسويات تطابق معايير التصفية الحالية."
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

export function CountAdjustmentReportTable() {
  return <CountAdjustmentReportTableImpl />
}
