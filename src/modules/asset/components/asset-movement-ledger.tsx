import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'

import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { pageRows } from '@/shared/utils/table-data'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { formatDateTime } from '@/shared/utils/format'
import type { AssetMovement } from '@/modules/asset/types/asset.types'
import { useAssetMovementsQuery } from '@/modules/asset/hooks/use-asset-queries'
import { ASSET_MOVEMENT_TYPE_LABELS_AR } from '@/modules/asset/asset-movement-labels'

export interface AssetMovementLedgerProps {
  assetId: string
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, AssetMovement>()

/**
 * Immutable asset movement history ledger: server-paged
 * `GET /assets/{assetId}/movements` rendered as a read-only table under the
 * asset detail page. Rows are append-only; the ledger exposes no mutation
 * affordances.
 *
 * The live movement row carries the movement type, its document (type +
 * reference number) and the moment it happened. It carries NO warehouse
 * routing and NO operator, so the columns show only what the server sends.
 */
export function AssetMovementLedger({ assetId }: AssetMovementLedgerProps) {
  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const movementsQuery = useAssetMovementsQuery(assetId, {
    page: currentPage,
    pageSize,
  })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('movementType', {
          id: 'movementType',
          header: 'نوع الحركة',
          cell: ({ getValue }) => ASSET_MOVEMENT_TYPE_LABELS_AR[getValue()],
        }),
        columnHelper.accessor('documentType', {
          id: 'documentType',
          header: 'نوع السند',
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-xs">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('documentReferenceNumber', {
          id: 'documentReferenceNumber',
          header: 'السند المرجعي',
          cell: ({ getValue }) => (
            <span dir="ltr" className="font-mono text-xs">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('movedAtUtc', {
          id: 'movedAtUtc',
          header: 'تاريخ الحركة',
          cell: ({ getValue }) => <span dir="ltr">{formatDateTime(getValue())}</span>,
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
      page={currentPage}
      pageSize={pageSize}
      totalCount={movementsQuery.data?.totalItems}
      totalPages={Math.max(movementsQuery.data?.totalPages ?? 1, 1)}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  )
}
