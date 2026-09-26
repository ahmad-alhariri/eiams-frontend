import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { ADJUSTMENT_PURPOSE_LABELS_AR } from '@/modules/adjustment/types/adjustment.types'
import { useCountAdjustmentReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type { ListCountAdjustmentReportQuery } from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Input } from '@/shared/ui/input'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime } from '@/shared/utils/format'
import type { InventoryAdjustment } from '@/shared/types/generated/eiams-v1'

const adjustmentColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryAdjustment>()

const REASON_PREVIEW_LENGTH = 40

function truncateReason(reason: string): string {
  return reason.length > REASON_PREVIEW_LENGTH
    ? `${reason.slice(0, REASON_PREVIEW_LENGTH)}…`
    : reason
}

function toIsoDateTime(value: string): string | undefined {
  if (value === '') return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

/**
 * Count & adjustment report (e23-t08). Server-paged adjustment document
 * projection; purpose and lifecycle state come directly from the contract and
 * retain their D-ADJ-01 meanings (Draft → Posted → Reversed). The frontend
 * never calculates variance or infers a count-to-adjustment match — counts
 * remain a separately contracted projection per D-RPT-01 §"V1 contract
 * matrix".
 */
function CountAdjustmentReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')

  const dateFrom = toIsoDateTime(dateFromInput)
  const dateTo = toIsoDateTime(dateToInput)

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListCountAdjustmentReportQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
    }),
    [currentPage, dateFrom, dateTo, pageSize, warehouseId],
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
    (value: string) => resetPageAndSet(setDateFromInput, value),
    [resetPageAndSet],
  )
  const handleDateToChange = useCallback(
    (value: string) => resetPageAndSet(setDateToInput, value),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      adjustmentColumnHelper.columns([
        adjustmentColumnHelper.accessor('documentReference', {
          id: 'DocumentReference',
          header: 'رقم السند',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-sm font-semibold text-foreground">
              {getValue()}
            </span>
          ),
        }),
        adjustmentColumnHelper.accessor('purpose', {
          id: 'Purpose',
          header: 'الغرض',
          enableSorting: false,
          cell: ({ getValue }) => ADJUSTMENT_PURPOSE_LABELS_AR[getValue()],
        }),
        adjustmentColumnHelper.accessor('status', {
          id: 'Status',
          header: 'الحالة',
          enableSorting: false,
          cell: ({ getValue }) => <StatusBadge entity="adjustment" status={getValue()} />,
        }),
        adjustmentColumnHelper.accessor((row) => row.warehouse.displayName, {
          id: 'Warehouse',
          header: 'المستودع',
          enableSorting: false,
        }),
        adjustmentColumnHelper.accessor('countReference', {
          id: 'CountReference',
          header: 'مرجع الجرد',
          enableSorting: false,
          cell: ({ getValue }) =>
            getValue() === null || getValue() === undefined ? (
              '—'
            ) : (
              <span dir="ltr">{getValue()}</span>
            ),
        }),
        adjustmentColumnHelper.accessor('reason', {
          id: 'Reason',
          header: 'السبب',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="text-sm text-muted-foreground">{truncateReason(getValue())}</span>
          ),
        }),
        adjustmentColumnHelper.accessor((row) => row.createdAt ?? null, {
          id: 'CreatedAt',
          header: 'تاريخ الإنشاء',
          enableSorting: false,
          cell: ({ getValue }) => {
            const value = getValue()
            return value === null ? '—' : formatDateTime(value)
          },
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير الجرد والتسويات"
        subtitle="قراءة فقط، تعتمد على الخادم. لا يحتسب المتصفح فروقات الجرد أو يطابق الجرد مع التسويات."
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
        title="قائمة التسويات"
        description="كل تسوية ضمن النطاق الحالي مع غرضها وحالتها ومرجع الجرد إن وُجد."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير الجرد والتسويات"
          errorMessage="تعذّر جلب قائمة التسويات. حاول مرة أخرى."
          emptyTitle="لا توجد تسويات"
          emptyDescription="لم يتم العثور على تسويات تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
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
