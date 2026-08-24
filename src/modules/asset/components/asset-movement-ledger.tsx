import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'

import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { pageRows } from '@/shared/utils/table-data'
import type { AssetMovement } from '@/shared/types/generated/eiams-v1'
import { useAssetMovementsQuery } from '@/modules/asset/hooks/use-asset-queries'

export interface AssetMovementLedgerProps {
  assetId: string
}

/** Arabic labels for the immutable asset movement event types (D-RAE-01). */
export const ASSET_MOVEMENT_TYPE_LABELS_AR: Readonly<Record<AssetMovement['eventType'], string>> = {
  Received: 'استلام',
  Issued: 'صرف',
  Returned: 'إرجاع',
  Disposed: 'استبعاد',
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, AssetMovement>()

/**
 * Immutable asset movement history ledger (e18-t05): server-paged
 * `GET /assets/{id}/movements` rendered as a read-only table under the asset
 * detail page. Rows are append-only per D-RAE-01; the ledger exposes no
 * mutation affordances.
 */
export function AssetMovementLedger({ assetId }: AssetMovementLedgerProps) {
  const movementsQuery = useAssetMovementsQuery(assetId, { pageIndex: 0, pageSize: 20 })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('eventType', {
          id: 'eventType',
          header: 'نوع الحدث',
          cell: ({ getValue }) => ASSET_MOVEMENT_TYPE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor(
          (movement) => movement.fromWarehouse?.displayName ?? '—',
          { id: 'fromWarehouse', header: 'من مستودع' },
        ),
        columnHelper.accessor(
          (movement) => movement.toWarehouse?.displayName ?? '—',
          { id: 'toWarehouse', header: 'إلى مستودع' },
        ),
        columnHelper.accessor((movement) => movement.occurredBy.displayName, {
          id: 'occurredBy',
          header: 'بواسطة',
        }),
        columnHelper.accessor('documentReference', {
          id: 'documentReference',
          header: 'السند المرجعي',
          cell: ({ getValue }) =>
            getValue() === undefined ? (
              '—'
            ) : (
              <span dir="ltr" className="font-mono text-xs">
                {getValue()}
              </span>
            ),
        }),
        columnHelper.accessor('occurredAt', {
          id: 'occurredAt',
          header: 'تاريخ الحدث',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {getValue()}
            </span>
          ),
        }),
      ]),
    [],
  )

  return (
    <DataTableServer
      columns={columns}
      data={pageRows(movementsQuery.data, movementsQuery.isError)}
      isLoading={movementsQuery.isLoading}
      isError={movementsQuery.isError}
      onRetry={() => void movementsQuery.refetch()}
      errorTitle="تعذّر تحميل سجل الحركات"
      errorMessage="تعذّر جلب سجل حركات هذا الأصل. حاول مرة أخرى."
      emptyTitle="لا توجد حركات"
      emptyDescription="لم تُسجَّل أي حركات لهذا الأصل بعد."
      page={1}
      pageSize={20}
      totalCount={movementsQuery.data?.meta.totalItems}
      totalPages={Math.max(movementsQuery.data?.meta.totalPages ?? 1, 1)}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />
  )
}
