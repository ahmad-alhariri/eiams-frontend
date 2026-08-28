import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { getAuditActionDisplay } from '@/modules/audit/types/audit-display'
import { useAuditLogsQuery } from '@/modules/audit/hooks/use-audit-queries'
import { AuditDetail } from '@/modules/audit/components/audit-detail'
import type { ListAuditLogsQuery } from '@/modules/audit/types/audit.types'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Input } from '@/shared/ui/input'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatUuid } from '@/shared/utils/format'
import type { AuditLog } from '@/shared/types/generated/eiams-v1'

const auditColumnHelper = createColumnHelper<typeof dataTableFeatures, AuditLog>()

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

function toIsoDateTime(value: string): string | undefined {
  if (value === '') return undefined

  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function toAuditDetailLocation(auditLogId: string): string {
  return `${ROUTE_PATHS.audit}?auditLogId=${encodeURIComponent(auditLogId)}`
}

/**
 * Immutable, server-paginated audit header explorer. The server owns the
 * chronology, filters, redaction policy, and every displayed audit fact.
 * The future detail surface consumes the linked auditLogId without this page
 * fetching or constructing any field diff itself.
 */
function AuditLogExplorerPageImpl() {
  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')

  const dateFrom = toIsoDateTime(dateFromInput)
  const dateTo = toIsoDateTime(dateToInput)
  const query = useMemo<ListAuditLogsQuery>(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(entityType === '' ? {} : { entityType }),
      ...(entityId === '' ? {} : { entityId }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
    }),
    [currentPage, dateFrom, dateTo, entityId, entityType, pageSize, search],
  )
  const auditLogsQuery = useAuditLogsQuery(query)

  const resetPage = useCallback(() => setPage(1), [setPage])
  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setSearch(nextSearch)
      resetPage()
    },
    [resetPage],
  )
  const handleEntityTypeChange = useCallback(
    (value: string) => {
      setEntityType(value)
      resetPage()
    },
    [resetPage],
  )
  const handleEntityIdChange = useCallback(
    (value: string) => {
      setEntityId(value)
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
    setSearch('')
    setEntityType('')
    setEntityId('')
    setDateFromInput('')
    setDateToInput('')
    resetPage()
  }, [resetPage])

  const columns = useMemo(
    () =>
      auditColumnHelper.columns([
        auditColumnHelper.accessor('occurredAt', {
          id: 'occurredAt',
          header: 'وقت الحدث',
          enableSorting: false,
          cell: ({ getValue, row }) => (
            <Link
              to={toAuditDetailLocation(row.original.auditLogId)}
              aria-label={`عرض تفاصيل سجل التدقيق ${formatUuid(row.original.auditLogId)}`}
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span dir="rtl">{formatDateTime(getValue())}</span>
            </Link>
          ),
        }),
        auditColumnHelper.accessor('action', {
          id: 'action',
          header: 'الإجراء',
          enableSorting: false,
          cell: ({ getValue }) => {
            const action = getAuditActionDisplay(getValue())
            return action.isKnown ? (
              <span>{action.text}</span>
            ) : (
              <code dir="ltr" className="text-xs font-medium text-muted-foreground">
                {action.text}
              </code>
            )
          },
        }),
        auditColumnHelper.accessor((auditLog) => auditLog.entityDisplay ?? auditLog.entityId, {
          id: 'entity',
          header: 'السجل المتأثر',
          enableSorting: false,
          cell: ({ getValue, row }) =>
            row.original.entityDisplay === null || row.original.entityDisplay === undefined ? (
              <span dir="ltr">{formatUuid(getValue())}</span>
            ) : (
              getValue()
            ),
        }),
        auditColumnHelper.accessor('entityType', {
          id: 'entityType',
          header: 'نوع السجل',
          enableSorting: false,
          cell: ({ getValue }) => (
            <code dir="ltr" className="text-xs font-medium text-muted-foreground">
              {getValue()}
            </code>
          ),
        }),
        auditColumnHelper.accessor((auditLog) => auditLog.occurredBy.displayName, {
          id: 'occurredBy',
          header: 'بواسطة',
          enableSorting: false,
        }),
        auditColumnHelper.accessor('summaryAr', {
          id: 'summaryAr',
          header: 'الملخص',
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? '—',
        }),
      ]),
    [],
  )

  const page = auditLogsQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="سجل التدقيق"
        subtitle="سجل للقراءة فقط؛ يرتبه الخادم زمنياً ويطبق النطاق والصلاحيات وسياسة حجب القيم قبل وصولها إلى المتصفح."
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FilterField label="نوع السجل">
              <Input
                value={entityType}
                onChange={(event) => handleEntityTypeChange(event.currentTarget.value)}
                placeholder="مثال: WarehouseDocument"
                aria-label="تصفية حسب نوع السجل"
                dir="ltr"
              />
            </FilterField>
            <FilterField label="معرّف السجل">
              <Input
                value={entityId}
                onChange={(event) => handleEntityIdChange(event.currentTarget.value)}
                placeholder="UUID"
                aria-label="تصفية حسب معرّف السجل"
                dir="ltr"
              />
            </FilterField>
            <FilterField label="من تاريخ الحدث">
              <Input
                type="datetime-local"
                value={dateFromInput}
                onChange={(event) => handleDateFromChange(event.currentTarget.value)}
                aria-label="من تاريخ الحدث"
              />
            </FilterField>
            <FilterField label="إلى تاريخ الحدث">
              <Input
                type="datetime-local"
                value={dateToInput}
                onChange={(event) => handleDateToChange(event.currentTarget.value)}
                aria-label="إلى تاريخ الحدث"
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
        title="عمليات التدقيق"
        description="يُطبَّق البحث على النص الظاهر فقط، ولا توجد أعمدة فرز لأن التسلسل الزمني دليل تدقيق يملكه الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, auditLogsQuery.isError)}
          isLoading={auditLogsQuery.isLoading}
          isError={auditLogsQuery.isError}
          onRetry={() => void auditLogsQuery.refetch()}
          errorTitle="تعذّر تحميل سجل التدقيق"
          errorMessage="تعذّر جلب عمليات التدقيق من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          emptyTitle="لا توجد عمليات تدقيق"
          emptyDescription="لم يتم العثور على عمليات تطابق عوامل التصفية الحالية ضمن نطاق العمل."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في الملخص أو السجل أو المنفذ..."
        />
      </ContentCard>
    </div>
  )
}

export default function AuditLogExplorerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const auditLogId = searchParams.get('auditLogId') ?? undefined

  if (auditLogId !== undefined) {
    return <AuditDetail auditLogId={auditLogId} onBack={() => navigate(ROUTE_PATHS.audit)} />
  }

  return <AuditLogExplorerPageImpl />
}
