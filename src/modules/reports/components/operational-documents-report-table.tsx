import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useOperationalDocumentsReportQuery } from '@/modules/reports/hooks/use-reports-queries'
import type { ListOperationalDocumentsReportQuery } from '@/modules/reports/types/reports.types'
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
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'

const documentColumnHelper = createColumnHelper<typeof dataTableFeatures, WarehouseDocument>()

const DOCUMENT_TYPE_LABELS_AR: Readonly<Record<WarehouseDocument['documentType'], string>> = {
  Receiving: 'سند استلام',
  Issue: 'سند إصدار',
  Transfer: 'سند تحويل',
  Adjustment: 'سند تسوية',
  Opening: 'رصيد افتتاحي',
  Return: 'سند إرجاع',
}

function toIsoDateTime(value: string): string | undefined {
  if (value === '') return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

/**
 * Operational documents report (e23-t09). Server-paged document spine
 * projection; status and provenance come directly from the contract and
 * retain their D-LIFE-01 meanings. The contract allows only `dateFrom`,
 * `dateTo`, `warehouseId`, `pageIndex`, and `pageSize` — no `documentType`
 * or status filter is permitted without a contract update
 * (D-RPT-01 §"V1 contract matrix", operational documents report row).
 */
function OperationalDocumentsReportTableImpl() {
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')

  const dateFrom = toIsoDateTime(dateFromInput)
  const dateTo = toIsoDateTime(dateToInput)

  const warehouseSelector = useScopedWarehouseSelector()

  const queryInput = useMemo<ListOperationalDocumentsReportQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
    }),
    [currentPage, dateFrom, dateTo, pageSize, warehouseId],
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
    (value: string) => resetPageAndSet(setDateFromInput, value),
    [resetPageAndSet],
  )
  const handleDateToChange = useCallback(
    (value: string) => resetPageAndSet(setDateToInput, value),
    [resetPageAndSet],
  )

  const columns = useMemo(
    () =>
      documentColumnHelper.columns([
        documentColumnHelper.accessor('systemReferenceNumber', {
          id: 'SystemReferenceNumber',
          header: 'الرقم المرجعي',
          enableSorting: false,
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-sm font-semibold text-foreground">
              {getValue()}
            </span>
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
        documentColumnHelper.accessor((doc) => doc.warehouse.displayName, {
          id: 'Warehouse',
          header: 'المستودع',
          enableSorting: false,
        }),
        documentColumnHelper.accessor('paperDocumentNumber', {
          id: 'PaperDocumentNumber',
          header: 'رقم الورقي',
          enableSorting: false,
          cell: ({ getValue, row }) => (
            <span dir="ltr" className="font-mono text-sm text-muted-foreground">
              {row.original.paperDocumentYear}/{getValue()}
            </span>
          ),
        }),
        documentColumnHelper.accessor('createdAt', {
          id: 'CreatedAt',
          header: 'تاريخ الإنشاء',
          enableSorting: false,
          cell: ({ getValue }) => formatDateTime(getValue()),
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
        title="قائمة المستندات"
        description="كل سند ضمن النطاق الحالي بنوعه وحالته ومرجعه الورقي."
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
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
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
