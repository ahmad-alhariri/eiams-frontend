import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { DocumentListFilters } from '@/shared/documents/use-document-queries'
import { useDocumentListQuery } from '@/shared/documents/use-document-queries'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import { formatDateTime } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

type DocumentRouteEntry = {
  documentType: WarehouseDocument['documentType']
  detailRouteKey: RouteKey
  routeKey: RouteKey
}

const DOCUMENT_STATUS_LABELS_AR: Readonly<Record<WarehouseDocument['documentStatus'], string>> = {
  Draft: 'مسودة',
  Submitted: 'بانتظار الترحيل',
  Posted: 'مرحّل',
  Reversed: 'معكوس',
  Cancelled: 'ملغي',
  Rejected: 'مرفوض',
}

const DOCUMENT_LIST_ROUTE_ENTRIES: Readonly<Record<string, DocumentRouteEntry>> = {
  [ROUTE_PATHS.documentReceiving]: {
    routeKey: 'documentReceiving',
    detailRouteKey: 'documentReceivingDetail',
    documentType: 'Receiving',
  },
  [ROUTE_PATHS.documentIssue]: {
    routeKey: 'documentIssue',
    detailRouteKey: 'documentIssueDetail',
    documentType: 'Issue',
  },
  [ROUTE_PATHS.documentTransfer]: {
    routeKey: 'documentTransfer',
    detailRouteKey: 'documentTransferDetail',
    documentType: 'Transfer',
  },
  [ROUTE_PATHS.documentOpening]: {
    routeKey: 'documentOpening',
    detailRouteKey: 'documentOpeningDetail',
    documentType: 'Opening',
  },
  [ROUTE_PATHS.documentReturn]: {
    routeKey: 'documentReturn',
    detailRouteKey: 'documentReturnDetail',
    documentType: 'Return',
  },
}

const documentColumnHelper = createColumnHelper<typeof dataTableFeatures, WarehouseDocument>()

/**
 * One file, many scoped pages: the route path picks the document type, the
 * title/description come from route metadata, and the detail link follows the
 * type detail route. The table is a contract-backed server-side list (search,
 * status filter, warehouse filter, pagination) — no client-side data.
 */
function DocumentListPage() {
  const location = useLocation()
  const routeEntry = DOCUMENT_LIST_ROUTE_ENTRIES[location.pathname]
  const documentType = routeEntry?.documentType

  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WarehouseDocument['documentStatus'] | undefined>()
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
      setStatus(
        value === null || value === 'all'
          ? undefined
          : (value as WarehouseDocument['documentStatus']),
      )
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

  const filters = useMemo<DocumentListFilters>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(documentType === undefined ? {} : { documentType }),
      ...(search.trim() === '' ? {} : { search: search.trim() }),
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
                    row.original.documentId,
                  )}
                >
                  <span dir="ltr">{getValue()}</span>
                </Link>
              ),
            }),
            documentColumnHelper.accessor('paperDocumentNumber', {
              id: 'paperDocumentNumber',
              header: 'رقم السند الورقي',
              cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
            }),
            documentColumnHelper.accessor((document) => document.warehouse.displayName, {
              id: 'warehouse',
              header: 'المستودع',
            }),
            documentColumnHelper.accessor('documentStatus', {
              id: 'documentStatus',
              header: 'الحالة',
              cell: ({ getValue }) => <StatusBadge entity="document" status={getValue()} />,
            }),
            documentColumnHelper.accessor('createdAt', {
              id: 'createdAt',
              header: 'تاريخ الإنشاء',
              cell: ({ getValue }) => formatDateTime(getValue()),
            }),
            documentColumnHelper.accessor((document) => document.createdBy.displayName, {
              id: 'createdBy',
              header: 'أنشأها',
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
                  {(
                    Object.keys(DOCUMENT_STATUS_LABELS_AR) as WarehouseDocument['documentStatus'][]
                  ).map((documentStatus) => (
                    <SelectItem key={documentStatus} value={documentStatus}>
                      {DOCUMENT_STATUS_LABELS_AR[documentStatus]}
                    </SelectItem>
                  ))}
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
        description="ابحث برقم المرجع النظامي أو رقم السند الورقي، وصفِّ النتائج حسب الحالة أو المستودع. تُنفَّذ النتائج والترقيم في الخادم."
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
          totalCount={documentListQuery.data?.meta.totalItems}
          totalPages={Math.max(documentListQuery.data?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث برقم المرجع أو رقم السند..."
        />
      </ContentCard>
    </div>
  )
}

export default DocumentListPage
