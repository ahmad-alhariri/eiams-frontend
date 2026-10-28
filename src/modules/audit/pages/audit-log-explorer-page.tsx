import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { getAuditActionDisplay } from '@/modules/audit/types/audit-display'
import { auditRangeError } from '@/modules/audit/types/audit.types'
import { useAuditLogsQuery } from '@/modules/audit/hooks/use-audit-queries'
import { AuditDetail } from '@/modules/audit/components/audit-detail'
import type { ListAuditLogsQuery } from '@/modules/audit/types/audit.types'
import type { AuditLogHeader } from '@/modules/audit/types/audit.api-types'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { DatePicker } from '@/shared/ui/date-picker'
import { Input } from '@/shared/ui/input'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatUuid } from '@/shared/utils/format'

const auditColumnHelper = createColumnHelper<typeof dataTableFeatures, AuditLogHeader>()

type FilterFieldProps = {
  children: ReactNode
  label: string
  /** Inline Arabic error shown under the control (the repo's field-error style). */
  error?: { id: string; messageAr: string } | undefined
}

function FilterField({ children, label, error }: FilterFieldProps) {
  return (
    <div className="flex min-w-44 flex-col gap-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {error ? (
        <p id={error.id} role="alert" className="text-sm font-medium text-destructive">
          {error.messageAr}
        </p>
      ) : null}
    </div>
  )
}

function toAuditDetailLocation(auditLogId: string): string {
  return `${ROUTE_PATHS.audit}?auditLogId=${encodeURIComponent(auditLogId)}`
}

/**
 * The accessible name that tells two audit rows apart.
 *
 * The audit log id alone cannot do it: the row shows it truncated, so every
 * row read out loud starts with the same prefix and a shortened identifier.
 * The name is built from what the row actually shows — the translated action,
 * the entity it touched and when it happened — and falls back to the audit log
 * id for a row that shows no entity at all.
 */
function toAuditRowAccessibleName(header: AuditLogHeader): string {
  const action = getAuditActionDisplay(header.action, header.actionDisplayAr)
  const entity = header.entityId === '' ? header.id : `${header.entityType} ${header.entityId}`

  return `عرض تفاصيل سجل التدقيق: ${action.text} — ${entity} — ${formatDateTime(header.createdAtUtc)}`
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
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [pickerResetKey, setPickerResetKey] = useState(0)
  const rangeErrorId = useId()

  /**
   * The server refuses a range that is half filled, inverted or longer than
   * 366 days (`DateRangeLimits.IsValid`) with a 400 the list cannot explain,
   * so the pair is checked here first and a broken range is never sent.
   */
  const rangeError = useMemo(
    () => auditRangeError({ from: dateFrom, to: dateTo }),
    [dateFrom, dateTo],
  )

  const dateFromIso = dateFrom ? dateFrom.toISOString() : undefined
  const dateToIso = dateTo ? dateTo.toISOString() : undefined
  const query = useMemo<ListAuditLogsQuery>(
    () => ({
      // The wire page is ONE-based (`PaginationQueryParameters.Page`), and the
      // date range is `fromUtc` / `toUtc` (`GetAuditLogsRequest.FromUtc`).
      page: currentPage,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(entityType === '' ? {} : { entityType }),
      ...(entityId === '' ? {} : { entityId }),
      ...(rangeError !== null || dateFromIso === undefined ? {} : { fromUtc: dateFromIso }),
      ...(rangeError !== null || dateToIso === undefined ? {} : { toUtc: dateToIso }),
    }),
    [currentPage, dateFromIso, dateToIso, entityId, entityType, pageSize, rangeError, search],
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
    (date: Date | undefined) => {
      setDateFrom(date)
      resetPage()
    },
    [resetPage],
  )
  const handleDateToChange = useCallback(
    (date: Date | undefined) => {
      setDateTo(date)
      resetPage()
    },
    [resetPage],
  )
  const clearFilters = useCallback(() => {
    setSearch('')
    setEntityType('')
    setEntityId('')
    setDateFrom(undefined)
    setDateTo(undefined)
    setPickerResetKey((key) => key + 1)
    resetPage()
  }, [resetPage])

  const columns = useMemo(
    () =>
      auditColumnHelper.columns([
        auditColumnHelper.accessor('createdAtUtc', {
          id: 'createdAtUtc',
          header: 'تاريخ الإنشاء',
          enableSorting: false,
          cell: ({ getValue, row }) => (
            <Link
              to={toAuditDetailLocation(row.original.id)}
              aria-label={toAuditRowAccessibleName(row.original)}
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
          cell: ({ getValue, row }) => {
            const action = getAuditActionDisplay(getValue(), row.original.actionDisplayAr)
            return action.isKnown ? (
              <span>{action.text}</span>
            ) : (
              <code dir="ltr" className="text-xs font-medium text-muted-foreground">
                {action.text}
              </code>
            )
          },
        }),
        auditColumnHelper.accessor('entityId', {
          id: 'entityId',
          header: 'السجل المتأثر',
          enableSorting: false,
          cell: ({ getValue }) => <span dir="ltr">{formatUuid(getValue())}</span>,
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
        auditColumnHelper.accessor('userId', {
          id: 'userId',
          header: 'بواسطة',
          enableSorting: false,
          cell: ({ getValue }) => {
            const userId = getValue()
            return userId === null ? <span>—</span> : <span dir="ltr">{formatUuid(userId)}</span>
          },
        }),
        auditColumnHelper.accessor('commandName', {
          id: 'commandName',
          header: 'الأمر المنفَّذ',
          enableSorting: false,
          cell: ({ getValue }) => {
            const commandName = getValue()
            return commandName === null ? (
              <span>—</span>
            ) : (
              <code dir="ltr" className="text-xs font-medium text-muted-foreground">
                {commandName}
              </code>
            )
          },
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
            <FilterField
              label="من تاريخ الإنشاء"
              error={
                rangeError?.field === 'from'
                  ? { id: rangeErrorId, messageAr: rangeError.messageAr }
                  : undefined
              }
            >
              <DatePicker
                key={`date-from-${pickerResetKey}`}
                ariaLabel="من تاريخ الإنشاء"
                {...(rangeError?.field === 'from'
                  ? { 'aria-invalid': true, 'aria-describedby': rangeErrorId }
                  : {})}
                onChange={handleDateFromChange}
              />
            </FilterField>
            <FilterField
              label="إلى تاريخ الإنشاء"
              error={
                rangeError?.field === 'to'
                  ? { id: rangeErrorId, messageAr: rangeError.messageAr }
                  : undefined
              }
            >
              <DatePicker
                key={`date-to-${pickerResetKey}`}
                ariaLabel="إلى تاريخ الإنشاء"
                {...(rangeError?.field === 'to'
                  ? { 'aria-invalid': true, 'aria-describedby': rangeErrorId }
                  : {})}
                onChange={handleDateToChange}
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
        description="يُطبَّق البحث على نص الإجراء أو نوع السجل أو الأمر أو معرّف الطلب، ولا توجد أعمدة فرز لأن التسلسل الزمني دليل تدقيق يملكه الخادم."
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
          totalCount={page?.totalItems}
          totalPages={Math.max(page?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في الإجراء أو نوع السجل أو الأمر..."
        />
      </ContentCard>
    </div>
  )
}

export default function AuditLogExplorerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  // `?auditLogId=` (present but blank) means "no detail requested". Read as
  // absent so the detail query stays disabled instead of requesting
  // `GET /audit-logs/` and rendering a not-found error for a parameter the user
  // never filled in.
  const requestedAuditLogId = searchParams.get('auditLogId')?.trim()
  const auditLogId = requestedAuditLogId ? requestedAuditLogId : undefined

  if (auditLogId !== undefined) {
    return <AuditDetail auditLogId={auditLogId} onBack={() => navigate(ROUTE_PATHS.audit)} />
  }

  return <AuditLogExplorerPageImpl />
}
