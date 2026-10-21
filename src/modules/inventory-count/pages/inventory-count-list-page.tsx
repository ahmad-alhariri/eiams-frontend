import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import {
  INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR,
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
  type CountStatus,
  type ListCountsQuery,
} from '@/modules/inventory-count/types/inventory-count.types'
import { useInventoryCountsQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { CountWarehouseName } from '@/modules/inventory-count/components/count-name-fields'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import type { InventoryCountListItem } from '@/modules/inventory-count/types/inventory-count.types'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

/**
 * Count-session list (e20-t02, IC-FE-1): every count session in the active
 * scope (cross-warehouse — `warehouseId` stays OPTIONAL), 1-based paged
 * through the shared transport normalizer, filterable by lifecycle status
 * (including `Aborted`), with a `count.plan`-gated create CTA. Columns render
 * flat DTO fields and resolved ids only — no `referenceNumber`, no counts,
 * no nested objects (the live list projection carries none of them).
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCountListItem>()

const LIFECYCLE_STATUSES = Object.keys(INVENTORY_COUNT_STATUS_LABELS_AR) as readonly CountStatus[]

export default function InventoryCountListPage() {
  const pagination = useServerPagination()
  const [status, setStatus] = useState<CountStatus | undefined>()
  const { has } = usePermission()

  const filters = useMemo<ListCountsQuery>(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...(status === undefined ? {} : { status }),
    }),
    [pagination.page, pagination.pageSize, status],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as CountStatus))
      pagination.setPage(1)
    },
    [pagination],
  )

  const countsQuery = useInventoryCountsQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('countType', {
          id: 'countType',
          header: 'نوع الجرد',
          cell: ({ getValue }) => INVENTORY_COUNT_TYPE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('warehouseId', {
          id: 'warehouse',
          header: 'المستودع',
          cell: ({ getValue }) => <CountWarehouseName warehouseId={getValue()} />,
        }),
        columnHelper.accessor('scopeType', {
          id: 'scope',
          header: 'النطاق',
          cell: ({ getValue }) => INVENTORY_COUNT_SCOPE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('freezePolicy', {
          id: 'freezePolicy',
          header: 'سياسة التجميد',
          cell: ({ getValue }) => INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => (
            <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {INVENTORY_COUNT_STATUS_LABELS_AR[getValue()]}
            </span>
          ),
        }),
        columnHelper.accessor('plannedAtUtc', {
          id: 'plannedAtUtc',
          header: 'أُخططت في',
          cell: ({ getValue }) =>
            getValue() === null ? '—' : <span dir="ltr">{getValue()}</span>,
        }),
        columnHelper.display({
          id: 'open',
          header: '',
          cell: ({ row }) => (
            <Link
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.countDetail.replace(':countId', row.original.id)}
              aria-label="فتح جلسة الجرد"
            >
              فتح
            </Link>
          ),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.counts.labelAr}
        subtitle="جميع جلسات الجرد ضمن نطاق العمل الحالي مع حالتها ونطاقها وسياسة تجميدها."
        actions={
          has('count.plan') ? (
            <Link
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              to={ROUTE_PATHS.countNew}
            >
              جلسة جرد جديدة
            </Link>
          ) : null
        }
        toolbar={
          <div className="flex min-w-44 flex-col gap-2">
            <span className="text-sm font-medium text-foreground">حالة الجلسة</span>
            <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
              <SelectTrigger aria-label="تصفية حسب حالة الجلسة">
                <SelectValue>
                  {status === undefined ? 'كل الحالات' : INVENTORY_COUNT_STATUS_LABELS_AR[status]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {LIFECYCLE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {INVENTORY_COUNT_STATUS_LABELS_AR[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <ContentCard
        title="جلسات الجرد"
        description="كل جلسة جرد تسجل لقطة الأرصدة عند البدء، وتُقارن بها الكميات الفعلية. لا يُعدَّل الرصيد إلا عبر سند تسوية."
      >
        <DataTableServer
          columns={columns}
          data={[...(countsQuery.data?.items ?? [])]}
          isLoading={countsQuery.isLoading}
          isError={countsQuery.isError}
          onRetry={() => void countsQuery.refetch()}
          errorTitle="تعذّر تحميل جلسات الجرد"
          errorMessage="تعذّر جلب قائمة الجلسات. حاول مرة أخرى."
          emptyTitle="لا توجد جلسات جرد"
          emptyDescription={
            has('count.plan')
              ? 'ابدأ بإنشاء جلسة جرد جديدة من زر الإضافة.'
              : 'لم يتم العثور على جلسات جرد.'
          }
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={countsQuery.data?.totalItems}
          totalPages={Math.max(countsQuery.data?.totalPages ?? 1, 1)}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </ContentCard>
    </div>
  )
}
