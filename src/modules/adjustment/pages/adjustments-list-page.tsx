import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import {
  ADJUSTMENT_PURPOSE_LABELS_AR,
  ADJUSTMENT_STATUS_LABELS_AR,
  type ListAdjustmentsQuery,
} from '@/modules/adjustment/types/adjustment.types'
import { useAdjustmentsListQuery } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type {
  AdjustmentPurpose,
  AdjustmentStatus,
  InventoryAdjustment,
} from '@/shared/types/generated/eiams-v1'
import { formatDateTime } from '@/shared/utils/format'

/**
 * Adjustments list (e21-t02): every manager-owned adjustment document in the
 * active scope, filterable by purpose, lifecycle status, and warehouse — all
 * resolved server-side through the `/adjustments` contract (D-ADJ-01).
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, InventoryAdjustment>()

type PurposeValue = InventoryAdjustment['purpose']
type StatusValue = InventoryAdjustment['status']

const REASON_PREVIEW_LENGTH = 40

function truncateReason(reason: string): string {
  return reason.length > REASON_PREVIEW_LENGTH
    ? `${reason.slice(0, REASON_PREVIEW_LENGTH)}…`
    : reason
}

export default function AdjustmentsListPage() {
  const pagination = useServerPagination()
  const [purpose, setPurpose] = useState<PurposeValue | undefined>()
  const [status, setStatus] = useState<StatusValue | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const { has } = usePermission()

  const warehouseSelector = useScopedWarehouseSelector()

  const filters = useMemo<ListAdjustmentsQuery>(
    () => ({
      pageIndex: pagination.page - 1,
      pageSize: pagination.pageSize,
      ...(purpose === undefined ? {} : { purpose }),
      ...(status === undefined ? {} : { status }),
      ...(warehouseId === undefined || warehouseId === '' ? {} : { warehouseId }),
    }),
    [pagination.page, pagination.pageSize, purpose, status, warehouseId],
  )

  const handlePurposeChange = useCallback(
    (value: string | null) => {
      setPurpose(value === null || value === 'all' ? undefined : (value as AdjustmentPurpose))
      pagination.setPage(1)
    },
    [pagination],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as AdjustmentStatus))
      pagination.setPage(1)
    },
    [pagination],
  )

  const handleWarehouseChange = useCallback(
    (value: string | null) => {
      setWarehouseId(value ?? undefined)
      pagination.setPage(1)
    },
    [pagination],
  )

  const adjustmentsQuery = useAdjustmentsListQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('documentReference', {
          id: 'documentReference',
          header: 'رقم السند',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.adjustmentDetail.replace(':adjustmentId', row.original.adjustmentId)}
            >
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor('purpose', {
          id: 'purpose',
          header: 'الغرض',
          cell: ({ getValue }) => ADJUSTMENT_PURPOSE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="adjustment" status={getValue()} />,
        }),
        columnHelper.accessor((row) => row.warehouse.displayName, {
          id: 'warehouse',
          header: 'المستودع',
        }),
        columnHelper.accessor('countReference', {
          id: 'countReference',
          header: 'مرجع الجرد',
          cell: ({ getValue }) =>
            getValue() === null || getValue() === undefined ? (
              '—'
            ) : (
              <span dir="ltr">{getValue()}</span>
            ),
        }),
        columnHelper.accessor('reason', {
          id: 'reason',
          header: 'السبب',
          cell: ({ getValue }) => (
            <span className="text-muted-foreground" title={getValue()}>
              {truncateReason(getValue())}
            </span>
          ),
        }),
        columnHelper.accessor('createdAt', {
          id: 'createdAt',
          header: 'تاريخ الإنشاء',
          cell: ({ getValue }) =>
            getValue() === undefined ? '—' : formatDateTime(getValue() as string),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.adjustments.labelAr}
        subtitle="جميع سندات التسوية والإعدام ضمن نطاق العمل الحالي، مع بحث وتصفية تُنفَّذ في الخادم."
        actions={
          has('document.create') ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
                to={ROUTE_PATHS.assetDisposalNew}
              >
                سند إعدام أصل
              </Link>
              <Link
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                to={ROUTE_PATHS.adjustmentNew}
              >
                سند تسوية جديد
              </Link>
            </div>
          ) : null
        }
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الغرض</span>
              <Select value={purpose ?? 'all'} onValueChange={handlePurposeChange}>
                <SelectTrigger aria-label="تصفية حسب غرض التسوية">
                  <SelectValue>
                    {purpose === undefined ? 'كل الأغراض' : ADJUSTMENT_PURPOSE_LABELS_AR[purpose]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأغراض</SelectItem>
                  {(Object.keys(ADJUSTMENT_PURPOSE_LABELS_AR) as PurposeValue[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {ADJUSTMENT_PURPOSE_LABELS_AR[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الحالة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة السند">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : ADJUSTMENT_STATUS_LABELS_AR[status]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {(Object.keys(ADJUSTMENT_STATUS_LABELS_AR) as StatusValue[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {ADJUSTMENT_STATUS_LABELS_AR[value]}
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
        title="سندات التسوية"
        description="لا يُعدَّل الرصيد إلا عبر سند تسوية مرحّل؛ سندات الإعدام نهائية ولا يمكن عكسها."
      >
        <DataTableServer
          columns={columns}
          data={[...(adjustmentsQuery.data?.items ?? [])]}
          isLoading={adjustmentsQuery.isLoading}
          isError={adjustmentsQuery.isError}
          onRetry={() => void adjustmentsQuery.refetch()}
          errorTitle="تعذّر تحميل سندات التسوية"
          errorMessage="تعذّر جلب قائمة سندات التسوية. حاول مرة أخرى."
          emptyTitle="لا توجد سندات تسوية"
          emptyDescription={
            has('document.create')
              ? 'ابدأ بإنشاء سند تسوية جديد من زر الإضافة.'
              : 'لم يتم العثور على سندات تسوية.'
          }
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={adjustmentsQuery.data?.meta.totalItems}
          totalPages={Math.max(adjustmentsQuery.data?.meta.totalPages ?? 1, 1)}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </ContentCard>
    </div>
  )
}
