import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { usePendingCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { AssignCustodyDialog } from '@/modules/custody/components/assign-custody-dialog'
import type { PendingCustody } from '@/modules/custody/types/custody.types'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime } from '@/shared/utils/format'

const columnHelper = createColumnHelper<typeof dataTableFeatures, PendingCustody>()

/**
 * Pending-assignment rows are always Asset-subject custody rows (PRD §12.8);
 * the live `GET /custodies/pending` answers exactly those: the Operational +
 * Active custody rows of the assets issued out of one warehouse.
 *
 * The pending row carries the holder TYPE and ID but no holder display name,
 * and it carries no status and no custody kind — the endpoint answers "rows
 * awaiting a personal assignment", so the kind and the status are implied by
 * the row's presence and must not be invented.
 */
export default function PendingCustodyListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [assigningRow, setAssigningRow] = useState<PendingCustody | null>(null)
  const { has } = usePermission()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const warehouseSelector = useScopedWarehouseSelector()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>()

  // The pending list is WAREHOUSE-scoped on the server: the live endpoint
  // binds a non-nullable warehouse id and answers 404 for an unknown one, so
  // the warehouse comes from the active scope when the session is in one and
  // from the explicit picker otherwise.
  const warehouseId =
    selectedWarehouseId ??
    (activeScopeCacheKey?.kind === 'warehouse' ? activeScopeCacheKey.id : undefined)

  const handleWarehouseChange = useCallback(
    (value: string | null) => {
      setSelectedWarehouseId(value ?? undefined)
      setPage(1)
    },
    [setPage],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyPending.labelAr}
        subtitle="أصول صُرفت إلى جهة تشغيلية وتنتظر تكلفتها الشخصية لموظف، وفق تدفق ما بعد الصرف (PRD 12.8)."
        toolbar={
          <div className="flex min-w-44 flex-col gap-2">
            <span className="text-sm font-medium text-foreground">المستودع</span>
            <AsyncSelect
              value={warehouseId ?? null}
              onValueChange={handleWarehouseChange}
              loadOptions={warehouseSelector.loadOptions}
              disabled={!warehouseSelector.scopeReady}
              placeholder="اختر المستودع..."
              inputProps={{ 'aria-label': 'تصفية حسب المستودع' }}
            />
          </div>
        }
      />

      <ContentCard
        title="الأصول بانتظار التكليف"
        description="أصول صُرفت من مستودع واحد وما تزال في عهدة تشغيلية، بانتظار تكليفها لموظف. التكليف ينشئ سطر حفظ شخصياً ويغلق السطر التشغيلي الحالي."
      >
        {warehouseId === undefined ? (
          <p className="text-sm text-muted-foreground">
            اختر المستودع لعرض الأصول التي تنتظر التكليف الشخصي.
          </p>
        ) : (
          <PendingCustodyTable
            warehouseId={warehouseId}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            canAssign={has('custody.assign')}
            onAssign={setAssigningRow}
          />
        )}
      </ContentCard>

      {assigningRow !== null ? (
        <AssignCustodyDialog custody={assigningRow} onClose={() => setAssigningRow(null)} />
      ) : null}
    </div>
  )
}

function PendingCustodyTable({
  warehouseId,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  canAssign,
  onAssign,
}: {
  warehouseId: string
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  canAssign: boolean
  onAssign: (row: PendingCustody) => void
}) {
  const custodiesQuery = usePendingCustodiesQuery(warehouseId, page, pageSize)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('assetNumber', {
          id: 'assetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.assetDetail.replace(':assetId', row.original.assetId)}
            >
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor((row) => `${row.holderType}:${row.holderId}`, {
          id: 'holder',
          header: 'الجهة الحائزة (تشغيلي)',
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-xs">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('fromUtc', {
          id: 'fromUtc',
          header: 'قيد العهدة منذ',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {formatDateTime(getValue())}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canAssign ? (
              <Button type="button" variant="outline" onClick={() => onAssign(row.original)}>
                تكليف موظف
              </Button>
            ) : null,
        }),
      ]),
    [canAssign, onAssign],
  )

  return (
    <DataTableServer
      columns={columns}
      data={pageRows(custodiesQuery.data, custodiesQuery.isError)}
      isLoading={custodiesQuery.isLoading}
      isError={custodiesQuery.isError}
      onRetry={() => void custodiesQuery.refetch()}
      errorTitle="تعذّر تحميل قائمة الانتظار"
      errorMessage="تعذّر جلب الأصول بانتظار التكليف. حاول مرة أخرى."
      emptyTitle="لا توجد أصول بانتظار التكليف"
      emptyDescription="جميع الأصول المصروفة مكلفة شخصياً بالفعل."
      page={page}
      pageSize={pageSize}
      totalCount={custodiesQuery.data?.totalItems}
      totalPages={Math.max(custodiesQuery.data?.totalPages ?? 1, 1)}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  )
}
