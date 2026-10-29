import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useOperationalDocumentsReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type {
  DocumentsReportRow,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { DatePicker } from '@/shared/ui/date-picker'
import { AsyncSelect } from '@/shared/ui/async-select'
import { ExportButton } from '@/shared/ui/export-button'
import { PrintButton } from '@/shared/ui/print-button'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatNumber } from '@/shared/utils/format'
import type { DocumentType } from '@/shared/documents/types/document-wire.types'

const documentColumnHelper = createColumnHelper<typeof dataTableFeatures, DocumentsReportRow>()

const DOCUMENT_TYPE_LABELS_AR: Readonly<Record<DocumentType, string>> = {
  Receiving: 'سند استلام',
  Issue: 'سند إصدار',
  Transfer: 'سند تحويل',
  Adjustment: 'سند تسوية',
  Opening: 'رصيد افتتاحي',
  Return: 'سند إرجاع',
}

/**
 * Operational documents report (e23-t09). `GET /reports/documents` answers with
 * a per-warehouse SUMMARY: one row per (warehouse, document type, document
 * status) triple carrying the server's document COUNT and the newest
 * timestamps of that group (`Application/Reports/Documents/DocumentsReportRow.cs:3-11`).
 *
 * There is NO document identity on the wire — no reference number, no paper
 * number, no attachments — so the table renders the grouped counters the
 * server sends and nothing more. The frozen snapshot's document spine
 * (`WarehouseDocument`) is not what this endpoint returns.
 *
 * The controller binds `warehouseId`, `documentType`, `status`, `fromUtc`,
 * `toUtc` and the one-based pagination
 * (`Web.Api/Controllers/Reports/GetDocumentsReportController.cs:26-33`); this
 * screen exposes the warehouse and the date window only.
 */
function OperationalDocumentsReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const dateFromIso = dateFrom ? dateFrom.toISOString() : undefined
  const dateToIso = dateTo ? dateTo.toISOString() : undefined

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListOperationalDocumentsReportQuery>(
    () => ({
      // The live controller binds a ONE-based `page`
      // (`PaginationQueryParameters.Page`); `pageIndex` was never bound.
      page: currentPage,
      pageSize,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(dateFromIso === undefined ? {} : { fromUtc: dateFromIso }),
      ...(dateToIso === undefined ? {} : { toUtc: dateToIso }),
    }),
    [currentPage, dateFromIso, dateToIso, pageSize, warehouseId],
  )

  const reportQuery = useOperationalDocumentsReportQuery(queryInput)
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
      documentColumnHelper.columns([
        documentColumnHelper.accessor((row) => row.warehouseName, {
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
        documentColumnHelper.accessor('documentType', {
          id: 'DocumentType',
          header: 'النوع',
          enableSorting: false,
          cell: ({ getValue }) => DOCUMENT_TYPE_LABELS_AR[getValue()],
        }),
        documentColumnHelper.accessor('documentStatus', {
          id: 'DocumentStatus',
          header: 'الحالة',
          enableSorting: false,
          cell: ({ getValue }) => <StatusBadge entity="document" status={getValue()} />,
        }),
        documentColumnHelper.accessor('documentCount', {
          id: 'DocumentCount',
          header: 'عدد المستندات',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatNumber(getValue())}</span>,
        }),
        documentColumnHelper.accessor('latestCreatedAtUtc', {
          id: 'LatestCreatedAtUtc',
          header: 'آخر إنشاء',
          enableSorting: false,
          cell: ({ getValue }) => {
            const value = getValue()
            return value === null ? <span>—</span> : <span dir="ltr">{formatDateTime(value)}</span>
          },
        }),
        documentColumnHelper.accessor('latestPostedAtUtc', {
          id: 'LatestPostedAtUtc',
          header: 'آخر ترحيل',
          enableSorting: false,
          cell: ({ getValue }) => {
            const value = getValue()
            return value === null ? <span>—</span> : <span dir="ltr">{formatDateTime(value)}</span>
          },
        }),
      ]),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تقرير المستندات التشغيلية"
        subtitle="قراءة فقط، تعتمد على الخادم. لا يستنتج المتصفح تصفية حسب النوع أو الحالة."
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
              <PrintButton aria-label="طباعة تقرير المستندات التشغيلية" />
              <ExportButton
                reportType="documents"
                requiredPermission="document.view"
                filters={
                  warehouseId !== undefined
                    ? {
                        ...(dateFromIso !== undefined ? { dateFrom: dateFromIso } : {}),
                        ...(dateToIso !== undefined ? { dateTo: dateToIso } : {}),
                        warehouseId,
                      }
                    : undefined
                }
                label="تصدير تقرير المستندات التشغيلية"
              />
            </div>
          </div>
        }
      />
      <ContentCard
        title="ملخص المستندات"
        description="لكل مستودع ونوع وحالة: عدد المستندات وآخر تاريخي إنشاء وترحيل، كما يحسبها الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, reportQuery.isError)}
          isLoading={reportQuery.isLoading}
          isError={reportQuery.isError}
          onRetry={() => void reportQuery.refetch()}
          errorTitle="تعذّر تحميل تقرير المستندات التشغيلية"
          errorMessage="تعذّر جلب قائمة المستندات. حاول مرة أخرى."
          emptyTitle="لا توجد مستندات تشغيلية"
          emptyDescription="لم يتم العثور على مستندات تطابق معايير التصفية الحالية."
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

export function OperationalDocumentsReportTable() {
  return <OperationalDocumentsReportTableImpl />
}
