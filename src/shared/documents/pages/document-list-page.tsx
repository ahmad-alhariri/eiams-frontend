import { IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import {
  type DocumentRouteEntry,
  RECEIVING_DOCUMENT_LIST_ENTRY,
} from '@/shared/documents/document-route-entries'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { DocumentListFilters } from '@/shared/documents/use-document-queries'
import { useDocumentListQuery } from '@/shared/documents/use-document-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type {
  DocumentStatus,
  WarehouseDocumentSummary,
} from '@/shared/documents/types/document-wire.types'
import { formatDate, formatDateTime } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

export interface DocumentListPageProps {
  /**
   * Explicit route entry — module seams (receiving, issue, ...) pin their type
   * and detail route so the shared page is not bound to pathname lookup.
   * When omitted, the page derives the entry from the current route path.
   */
  entry?: DocumentRouteEntry
}

const DOCUMENT_STATUS_LABELS_AR: Readonly<Record<DocumentStatus, string>> = {
  Draft: 'مسودة',
  Submitted: 'بانتظار الترحيل',
  Posted: 'مرحّل',
  Reversed: 'معكوس',
  Cancelled: 'ملغي',
  Rejected: 'مرفوض',
}

const DOCUMENT_LIST_ROUTE_ENTRIES: Readonly<Record<string, DocumentRouteEntry>> = {
  [ROUTE_PATHS.documentReceiving]: RECEIVING_DOCUMENT_LIST_ENTRY,
  [ROUTE_PATHS.documentIssue]: {
    routeKey: 'documentIssue',
    detailRouteKey: 'documentIssueDetail',
    createRouteKey: 'documentIssueNew',
    createLabelAr: 'سند إصدار جديد',
    documentType: 'Issue',
  },
  [ROUTE_PATHS.documentTransfer]: {
    routeKey: 'documentTransfer',
    detailRouteKey: 'documentTransferDetail',
    createRouteKey: 'documentTransferNew',
    createLabelAr: 'سند تحويل جديد',
    documentType: 'Transfer',
  },
  [ROUTE_PATHS.documentOpening]: {
    routeKey: 'documentOpening',
    detailRouteKey: 'documentOpeningDetail',
    createRouteKey: 'documentOpeningNew',
    createLabelAr: 'سند رصيد افتتاحي جديد',
    documentType: 'Opening',
  },
  [ROUTE_PATHS.documentReturn]: {
    routeKey: 'documentReturn',
    detailRouteKey: 'documentReturnDetail',
    createRouteKey: 'documentReturnNew',
    createLabelAr: 'سند إرجاع جديد',
    documentType: 'Return',
  },
}

const documentColumnHelper = createColumnHelper<
  typeof dataTableFeatures,
  WarehouseDocumentSummary
>()

/**
 * One file, many scoped pages: the route path picks the document type, the
 * title/description come from route metadata, and the detail link follows the
 * type detail route. The table is a contract-backed server-side list (search,
 * status filter, warehouse filter, pagination) — no client-side data.
 */
function DocumentListPage({ entry: explicitEntry }: DocumentListPageProps = {}) {
  const location = useLocation()
  const routeEntry = explicitEntry ?? DOCUMENT_LIST_ROUTE_ENTRIES[location.pathname]
  const documentType = routeEntry?.documentType

  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const { has } = usePermission()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DocumentStatus | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()

  const warehouseSelector = useScopedWarehouseSelector()

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearch(query)
      setPage(1)
    },
    [setPage],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as DocumentStatus))
      setPage(1)
    },
    [setPage],
  )

  const handleWarehouseChange = useCallback(
    (value: string | null) => {
      setWarehouseId(value ?? undefined)
      setPage(1)
    },
    [setPage],
  )

  // The list route has no free-text `search`: it exposes `systemReferenceNumber`
  // and `paperDocumentNumber` as two independent `Contains` filters, so the box
  // searches the system reference number and says so rather than claiming to
  // search both. `page` is one-based on both sides of this boundary —
  // `useServerPagination` and `toWireOneBasedPaginationParams` agree, so no ±1
  // conversion happens here.
  const filters = useMemo<DocumentListFilters>(
    () => ({
      page: currentPage,
      pageSize,
      ...(documentType === undefined ? {} : { documentType }),
      ...(search.trim() === '' ? {} : { systemReferenceNumber: search.trim() }),
      ...(status === undefined ? {} : { documentStatus: status }),
      ...(warehouseId === undefined ? {} : { warehouseId }),
    }),
    [currentPage, documentType, pageSize, search, status, warehouseId],
  )

  const documentListQuery = useDocumentListQuery(filters, {
    enabled: routeEntry !== undefined,
  })

  const columns = useMemo(
    () =>
      routeEntry === undefined
        ? []
        : documentColumnHelper.columns([
            documentColumnHelper.accessor('systemReferenceNumber', {
              id: 'systemReferenceNumber',
              header: 'رقم المرجع النظامي',
              cell: ({ getValue, row }) => (
                <Link
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                  to={ROUTE_PATHS[routeEntry.detailRouteKey].replace(
                    ':documentId',
                    row.original.id,
                  )}
                >
                  <span dir="ltr">{getValue()}</span>
                </Link>
              ),
            }),
            documentColumnHelper.accessor('paperDocumentNumber', {
              id: 'paperDocumentNumber',
              header: 'رقم السند الورقي',
              cell: ({ getValue }) => <span dir="ltr">{getValue() ?? '—'}</span>,
            }),
            // D-OPEN-02 (PRD §6.4): the Opening cut-off date is the day the stock
            // physically measured, which is NOT the creation date, so it needs its
            // own column rather than being folded into `createdAtUtc`. Only the
            // Opening list carries it; the other four document types have no such
            // concept and must render exactly as they did before.
            ...(routeEntry.documentType === 'Opening'
              ? [
                  documentColumnHelper.accessor('openingAsOfDate', {
                    id: 'openingAsOfDate',
                    header: 'تاريخ الرصيد الافتتاحي',
                    cell: ({ getValue, row }) => {
                      // A draft has no cut-off date yet, so the column is
                      // genuinely nullable — narrow once, then format.
                      // `formatDate` returns Arabic text (Arabic-Indic digits and
                      // an Arabic month name), so this cell deliberately sets no
                      // `dir` and inherits the RTL table like `createdAtUtc` does.
                      // The `dir="ltr"` cells above are the ones holding raw
                      // LTR codes off the wire.
                      const asOfDate = getValue()
                      return (
                        <div className="flex flex-col items-start gap-1">
                          <span>
                            {asOfDate === null || asOfDate === undefined
                              ? '—'
                              : formatDate(asOfDate)}
                          </span>
                          {row.original.openingIsZeroStock ? (
                            <Badge variant="warning">تهيئة بدون حركة</Badge>
                          ) : null}
                        </div>
                      )
                    },
                  }),
                ]
              : []),
            documentColumnHelper.accessor('warehouseId', {
              id: 'warehouse',
              header: 'المستودع',
              // The list projection identifies a warehouse by id only; there is no
              // display reference to render, so the id is shown rather than a label
              // the server did not send.
              cell: ({ getValue }) => (
                <span dir="ltr" className="break-all font-mono text-xs">
                  {getValue()}
                </span>
              ),
            }),
            documentColumnHelper.accessor('documentStatus', {
              id: 'documentStatus',
              header: 'الحالة',
              cell: ({ getValue }) => <StatusBadge entity="document" status={getValue()} />,
            }),
            documentColumnHelper.accessor('createdAtUtc', {
              id: 'createdAtUtc',
              header: 'تاريخ الإنشاء',
              cell: ({ getValue }) => formatDateTime(getValue()),
            }),
          ]),
    [routeEntry],
  )

  if (routeEntry === undefined) {
    return null
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA[routeEntry.routeKey].labelAr}
        subtitle={`سجل سندات هذا النوع ضمن نطاق العمل الحالي، مع بحث نصي وتصفية حسب الحالة والمستودع.`}
        actions={
          has('document.create') ? (
            <Button
              type="button"
              nativeButton={false}
              render={<Link to={ROUTE_PATHS[routeEntry.createRouteKey]} />}
            >
              <IconPlus aria-hidden data-icon="inline-start" />
              {routeEntry.createLabelAr}
            </Button>
          ) : null
        }
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الحالة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة السند">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : DOCUMENT_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {(Object.keys(DOCUMENT_STATUS_LABELS_AR) as DocumentStatus[]).map(
                    (documentStatus) => (
                      <SelectItem key={documentStatus} value={documentStatus}>
                        {DOCUMENT_STATUS_LABELS_AR[documentStatus]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
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
          </div>
        }
      />

      <ContentCard
        title="قائمة السندات"
        description="ابحث برقم المرجع النظامي، وصفِّ النتائج حسب الحالة أو المستودع. تُنفَّذ النتائج والترقيم في الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(documentListQuery.data, documentListQuery.isError)}
          isLoading={documentListQuery.isLoading}
          isError={documentListQuery.isError}
          onRetry={() => void documentListQuery.refetch()}
          errorTitle="تعذّر تحميل السندات"
          errorMessage="تعذّر جلب قائمة السندات. حاول مرة أخرى."
          emptyTitle="لا توجد سندات"
          emptyDescription="لم يتم العثور على سندات تطابق معايير البحث الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={documentListQuery.data?.totalItems}
          totalPages={Math.max(documentListQuery.data?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث برقم المرجع النظامي..."
        />
      </ContentCard>
    </div>
  )
}

export default DocumentListPage
