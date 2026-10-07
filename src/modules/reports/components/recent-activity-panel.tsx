import { createColumnHelper } from '@tanstack/react-table'
import { useMemo } from 'react'
import { Link } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { useAuditLogsQuery } from '@/modules/audit/hooks/use-audit-queries'
import { getAuditActionDisplay } from '@/modules/audit/types/audit-display'
import { InventoryLowStockBadge } from '@/modules/inventory/components/inventory-low-stock-badge'
import { useInventoryBalancesQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { pageRows } from '@/shared/utils/table-data'
import { formatDateTime, formatNumber, formatUuid } from '@/shared/utils/format'
import type { AuditLog, InventoryBalance } from '@/shared/types/generated/eiams-v1'

const auditColumnHelper = createColumnHelper<typeof dataTableFeatures, AuditLog>()
const balanceColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryBalance>()

/**
 * Recent activity & operational alerts (e23-t04).
 *
 * Per D-RPT-01 §"Recent activity and low-stock attention" the panel composes
 * two separately-permissioned server projections:
 *
 *  - "نشاط حديث" — the immutable audit header list
 *    (existing `D-AUD-02` operation), guarded by `audit-logs:view`.
 *  - "تنبيهات تشغيلية" — the inventory balance list with the low-stock
 *    server projection inline (existing `D-INV-READ-01` operation), guarded
 *    by `inventory:view`.
 *
 * The panel never constructs a new alert score, derives lifecycle history,
 * or claims a new aggregate. Sections whose permission the caller lacks are
 * hidden — not rendered as a synthetic empty.
 */
function RecentActivityPanelImpl() {
  const { has } = usePermission()
  const canViewAudit = has('audit.view')
  const canViewInventory = has('inventory.view')

  return (
    <div className="flex flex-col gap-6">
      {canViewAudit ? <RecentAuditSection /> : null}
      {canViewInventory ? <OperationalAlertsSection /> : null}
      {!canViewAudit && !canViewInventory ? (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          لا تتوفر لديك صلاحية لعرض نشاط حديث أو تنبيهات تشغيلية.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Most recent audit headers — first page of the immutable, redacted server
 * audit projection. No client-side filtering, sorting, or pagination.
 */
function RecentAuditSection() {
  const pagination = useRecentSectionPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination

  const queryInput = useMemo(
    () => ({
      pageIndex: currentPage - 1,
      pageSize,
    }),
    [currentPage, pageSize],
  )

  const auditQuery = useAuditLogsQuery(queryInput)
  const page = auditQuery.data

  const columns = useMemo(
    () =>
      auditColumnHelper.columns([
        auditColumnHelper.accessor('occurredAt', {
          id: 'OccurredAt',
          header: 'وقت الحدث',
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
        auditColumnHelper.accessor('action', {
          id: 'Action',
          header: 'الإجراء',
          cell: ({ getValue }) => {
            const display = getAuditActionDisplay(getValue())
            return (
              <span className={display.isKnown ? '' : 'font-mono text-sm text-muted-foreground'}>
                {display.text}
              </span>
            )
          },
        }),
        auditColumnHelper.accessor((row) => row.entityDisplay ?? row.entityId, {
          id: 'Entity',
          header: 'السجل المتأثر',
          cell: ({ getValue, row }) => (
            <Link
              to={`${ROUTE_PATHS.audit}?auditLogId=${encodeURIComponent(row.original.auditLogId)}`}
              aria-label={`عرض تفاصيل سجل التدقيق ${formatUuid(row.original.auditLogId)}`}
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {getValue()}
            </Link>
          ),
        }),
        auditColumnHelper.accessor('occurredBy', {
          id: 'OccurredBy',
          header: 'بواسطة',
          cell: ({ getValue }) => <span>{getValue().displayName}</span>,
        }),
      ]),
    [],
  )

  return (
    <section aria-labelledby="recent-audit-heading" className="flex flex-col gap-3">
      <h3 id="recent-audit-heading" className="text-lg font-semibold text-foreground">
        نشاط حديث
      </h3>
      <DataTableServer
        columns={columns}
        data={pageRows(page, auditQuery.isError)}
        isLoading={auditQuery.isLoading}
        isError={auditQuery.isError}
        onRetry={() => void auditQuery.refetch()}
        errorTitle="تعذّر تحميل نشاط التدقيق"
        errorMessage="تعذّر جلب أحدث عمليات التدقيق. حاول مرة أخرى."
        emptyTitle="لا توجد عمليات تدقيق حديثة"
        emptyDescription="لم يتم تسجيل أي عمليات تدقيق في النطاق الحالي."
        page={currentPage}
        pageSize={pageSize}
        totalCount={page?.meta.totalItems}
        totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </section>
  )
}

/**
 * Low-stock aware inventory projection — the existing balance list rendered
 * with the server-side `InventoryLowStockBadge` inline. The panel deliberately
 * does not filter to "low only" (that would require a client filter not
 * present in `ListInventoryBalancesQuery`); it shows the full list and lets
 * the badge surface the threshold-constrained rows.
 */
function OperationalAlertsSection() {
  const pagination = useRecentSectionPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination

  const queryInput = useMemo(
    () => ({
      page: currentPage - 1,
      pageSize,
    }),
    [currentPage, pageSize],
  )

  const balancesQuery = useInventoryBalancesQuery(queryInput)
  const page = balancesQuery.data

  const columns = useMemo(
    () =>
      balanceColumnHelper.columns([
        balanceColumnHelper.accessor((balance) => balance.warehouse.displayName, {
          id: 'Warehouse',
          header: 'المستودع',
        }),
        balanceColumnHelper.accessor((balance) => balance.material.displayName, {
          id: 'Material',
          header: 'المادة',
        }),
        balanceColumnHelper.accessor('quantity', {
          id: 'Quantity',
          header: 'الرصيد',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">
              {formatNumber(getValue(), { maxFractionDigits: 3 })}
            </span>
          ),
        }),
        balanceColumnHelper.accessor('lowStock', {
          id: 'LowStock',
          header: 'حالة التنبيه',
          cell: ({ getValue }) => (
            <InventoryLowStockBadge
              state={getValue().state}
              thresholdQuantity={getValue().thresholdQuantity}
            />
          ),
        }),
      ]),
    [],
  )

  return (
    <section aria-labelledby="operational-alerts-heading" className="flex flex-col gap-3">
      <h3 id="operational-alerts-heading" className="text-lg font-semibold text-foreground">
        تنبيهات تشغيلية
      </h3>
      <DataTableServer
        columns={columns}
        data={pageRows(page, balancesQuery.isError)}
        isLoading={balancesQuery.isLoading}
        isError={balancesQuery.isError}
        onRetry={() => void balancesQuery.refetch()}
        errorTitle="تعذّر تحميل تنبيهات المخزون"
        errorMessage="تعذّر جلب قائمة الأرصدة. حاول مرة أخرى."
        emptyTitle="لا توجد أرصدة"
        emptyDescription="لم يتم العثور على أرصدة في النطاق الحالي."
        page={currentPage}
        pageSize={pageSize}
        totalCount={page?.meta.totalItems}
        totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </section>
  )
}

/** Small wrapper so both sub-sections share one pagination config. */
function useRecentSectionPagination() {
  return useServerPagination({ initialPage: 1, initialPageSize: 10 })
}

export function RecentActivityPanel() {
  return <RecentActivityPanelImpl />
}
