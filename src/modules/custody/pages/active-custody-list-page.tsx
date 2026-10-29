import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { CustodyStatusBadge } from '@/modules/custody/components/custody-status-badge'
import {
  CUSTODY_STATUS_LABELS_AR,
  CUSTODY_SUBJECT_TYPE_LABELS_AR,
} from '@/modules/custody/custody-status-labels'
import type {
  Custody,
  CustodyStatus,
  CustodySubjectType,
  ListCustodiesQuery,
} from '@/modules/custody/types/custody.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatNumber } from '@/shared/utils/format'

const columnHelper = createColumnHelper<typeof dataTableFeatures, Custody>()

/** The three subject kinds the live `GET /custodies` can project. */
const SUBJECT_TYPE_FILTER_OPTIONS = (
  Object.entries(CUSTODY_SUBJECT_TYPE_LABELS_AR) as ReadonlyArray<[CustodySubjectType, string]>
).map(([value, label]) => ({ value, label }))

/** Every status the server projects; it is subject-dependent (see the label map). */
const CUSTODY_STATUS_FILTER_OPTIONS = (
  Object.entries(CUSTODY_STATUS_LABELS_AR) as ReadonlyArray<[CustodyStatus, string]>
).map(([value, label]) => ({ value, label }))

/**
 * The subject a custody row is about, rendered by subject kind: an Asset shows
 * its asset number, a TrackedUnit its serial number, and a MaterialQuantity its
 * material plus the quantity still held in custody.
 */
function SubjectCell({ row }: { row: Custody }) {
  const typeLabel = (
    <span className="text-xs text-muted-foreground">
      {CUSTODY_SUBJECT_TYPE_LABELS_AR[row.subjectType]}
    </span>
  )

  if (row.subjectType === 'MaterialQuantity') {
    return (
      <div className="flex flex-col gap-0.5">
        {typeLabel}
        <span className="text-sm font-medium">{row.materialNameAr}</span>
        <span className="text-xs text-muted-foreground">
          المتبقي في العهدة: {formatNumber(row.activeQuantity, { maxFractionDigits: 3 })}
        </span>
      </div>
    )
  }

  const identifier = row.subjectType === 'Asset' ? row.assetNumber : row.serialNumber

  return (
    <div className="flex flex-col gap-0.5">
      {typeLabel}
      <span dir="ltr" className="font-mono text-sm font-semibold text-foreground">
        {identifier ?? '—'}
      </span>
    </div>
  )
}

/**
 * Custody list: every custody row in the active scope — Asset-subject,
 * serial-tracked Durable (TrackedUnit) and quantity-tracked Durable
 * (MaterialQuantity) — filterable by subject type and status. Rows link to the
 * custody detail route; the transfer action composes on the detail page.
 *
 * These rows are CUSTODY (a holder's responsibility), never a stock balance: an
 * issue lowers the warehouse balance on the inventory balances screen and opens
 * a row here. The page says so in its own copy.
 *
 * The live `GET /custodies` binds `holderType`, `holderId`, `materialId`,
 * `subjectType`, `status`, `warehouseId`, `page` and `pageSize` — and NOTHING
 * else: it has no `search` and no `custodyKind`, so the list offers no search
 * box and no custody-kind filter.
 */
export default function ActiveCustodyListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  // No status is pinned until the operator picks one: the status is
  // SUBJECT-DEPENDENT (an Asset is Active/Closed, a TrackedUnit is
  // Issued/Returned/Disposed, a MaterialQuantity is Active/FullyReturned), so a
  // default of `Active` would hide every serial-tracked durable.
  const [status, setStatus] = useState<CustodyStatus | undefined>()
  const [subjectType, setSubjectType] = useState<CustodySubjectType | undefined>()

  // No subject type is sent for "all": the server then projects every kind.
  const filters = useMemo<ListCustodiesQuery>(
    () => ({
      page,
      pageSize,
      ...(subjectType === undefined ? {} : { subjectType }),
      ...(status === undefined ? {} : { status }),
    }),
    [page, pageSize, status, subjectType],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(
        CUSTODY_STATUS_FILTER_OPTIONS.some((option) => option.value === value)
          ? (value as CustodyStatus)
          : undefined,
      )
      setPage(1)
    },
    [setPage],
  )

  const handleSubjectTypeChange = useCallback(
    (value: string | null) => {
      setSubjectType(
        SUBJECT_TYPE_FILTER_OPTIONS.some((option) => option.value === value)
          ? (value as CustodySubjectType)
          : undefined,
      )
      setPage(1)
    },
    [setPage],
  )

  const custodiesQuery = useCustodiesQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('assetNumber', {
          id: 'assetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.custodyDetail.replace(':custodyId', row.original.custodyId)}
            >
              <span dir="ltr">{getValue() ?? '—'}</span>
            </Link>
          ),
        }),
        columnHelper.display({
          id: 'subject',
          header: 'الموضوع',
          cell: ({ row }) => <SubjectCell row={row.original} />,
        }),
        columnHelper.accessor('holderDisplayName', {
          id: 'holderDisplayName',
          header: 'الحائز',
        }),
        columnHelper.accessor('custodyKind', {
          id: 'custodyKind',
          header: 'نوع الحفظ',
          cell: ({ getValue }) => (getValue() === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'),
        }),
        columnHelper.accessor('fromUtc', {
          id: 'fromUtc',
          header: 'منذ',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {formatDateTime(getValue())}
            </span>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <CustodyStatusBadge status={getValue()} />,
        }),
        columnHelper.display({
          id: 'detailLink',
          header: '',
          cell: ({ row }) => (
            <Link
              className="text-sm text-primary underline-offset-4 hover:underline"
              to={ROUTE_PATHS.custodyDetail.replace(':custodyId', row.original.custodyId)}
            >
              عرض التفاصيل
            </Link>
          ),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyActive.labelAr}
        subtitle="عهد الأصول والمعمرات (بالتسلسل وبكمية) ضمن نطاق العمل الحالي، مع تصفية حسب نوع الموضوع وحالة العهدة."
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">نوع الموضوع</span>
              <Select value={subjectType ?? 'all'} onValueChange={handleSubjectTypeChange}>
                <SelectTrigger aria-label="تصفية حسب نوع الموضوع">
                  <SelectValue>
                    {subjectType === undefined
                      ? 'كل الأنواع'
                      : CUSTODY_SUBJECT_TYPE_LABELS_AR[subjectType]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {SUBJECT_TYPE_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">حالة العهدة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة العهدة">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : CUSTODY_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {CUSTODY_STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <ContentCard
        title="قائمة العهد"
        description={
          <>
            كل صف هنا <span className="font-semibold text-foreground">عهدة</span> (مسؤولية حائز عن
            أصل أو معمرة) وليس رصيد مخزون: الصرف يُنقص رصيد المخزون في المستودع وينشئ صف عهدة هنا.
            أرصدة المخزون تُعرض في{' '}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={ROUTE_PATHS.inventoryBalances}
            >
              {ROUTE_METADATA.inventoryBalances.labelAr}
            </Link>
            .
          </>
        }
      >
        <DataTableServer
          columns={columns}
          data={pageRows(custodiesQuery.data, custodiesQuery.isError)}
          isLoading={custodiesQuery.isLoading}
          isError={custodiesQuery.isError}
          onRetry={() => void custodiesQuery.refetch()}
          errorTitle="تعذّر تحميل العهد"
          errorMessage="تعذّر جلب قائمة العهد. حاول مرة أخرى."
          emptyTitle="لا توجد عهد"
          emptyDescription="لم يتم العثور على عهد تطابق معايير التصفية الحالية."
          page={page}
          pageSize={pageSize}
          totalCount={custodiesQuery.data?.totalItems}
          totalPages={Math.max(custodiesQuery.data?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
    </div>
  )
}
