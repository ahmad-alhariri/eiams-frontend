import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import {
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
  type ListInventoryCountsQuery,
} from '@/modules/inventory-count/types/inventory-count.types'
import { useInventoryCountsQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import type { InventoryCount } from '@/shared/types/generated/eiams-v1'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

/**
 * Count-session list (e20-t02): every count session in the active scope,
 * filterable by lifecycle status, with a `count.plan`-gated create CTA
 * rendered through the DataTable's toolbar slot.
 */
const columnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCount>()

type CountStatusValue = InventoryCount['status']

export default function InventoryCountListPage() {
  const pagination = useServerPagination()
  const [status, setStatus] = useState<CountStatusValue | undefined>()
  const { has } = usePermission()

  const filters = useMemo<ListInventoryCountsQuery>(
    () => ({
      pageIndex: pagination.page - 1,
      pageSize: pagination.pageSize,
      ...(status === undefined ? {} : { status }),
    }),
    [pagination.page, pagination.pageSize, status],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setStatus(value === null || value === 'all' ? undefined : (value as CountStatusValue))
      pagination.setPage(1)
    },
    [pagination],
  )

  const countsQuery = useInventoryCountsQuery(filters)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('referenceNumber', {
          id: 'referenceNumber',
          header: 'رقم الجلسة',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.countDetail.replace(':countId', row.original.countId)}
            >
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor((row) => row.warehouse.displayName, {
          id: 'warehouse',
          header: 'المستودع',
        }),
        columnHelper.accessor('countType', {
          id: 'countType',
          header: 'نوع الجرد',
          cell: ({ getValue }) => INVENTORY_COUNT_TYPE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor((row) => row.scope.scopeType, {
          id: 'scope',
          header: 'النطاق',
          cell: ({ row }) =>
            row.original.scope.summaryAr ??
            INVENTORY_COUNT_SCOPE_LABELS_AR[row.original.scope.scopeType],
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
        columnHelper.accessor('lineCount', {
          id: 'lineCount',
          header: 'عدد البنود',
          cell: ({ getValue }) => (getValue() === undefined ? '—' : String(getValue())),
        }),
        columnHelper.accessor('varianceCount', {
          id: 'varianceCount',
          header: 'الفروقات',
          cell: ({ getValue }) => (getValue() === undefined ? '—' : String(getValue())),
        }),
      ]),
    [],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.counts.labelAr}
        subtitle="جميع جلسات الجرد ضمن نطاق العمل الحالي مع حالتها ونطاقها وفروقاتها."
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
                {(Object.keys(INVENTORY_COUNT_STATUS_LABELS_AR) as CountStatusValue[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {INVENTORY_COUNT_STATUS_LABELS_AR[value]}
                    </SelectItem>
                  ),
                )}
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
          totalCount={countsQuery.data?.meta.totalItems}
          totalPages={Math.max(countsQuery.data?.meta.totalPages ?? 1, 1)}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </ContentCard>
    </div>
  )
}
