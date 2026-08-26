import { useMemo } from 'react'

import { useInventoryCountsQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { INVENTORY_COUNT_STATUS_LABELS_AR } from '@/modules/inventory-count/types/inventory-count.types'

/**
 * Active-count operational warning (e20-t09). When the operator drafts a new
 * count for a warehouse that already has an InProgress session, the
 * one-session-per-warehouse rule means this plan would be rejected (409) on
 * submit. Surfacing the conflict up-front — before the operator fills the
 * form — matches the contract's "one active count per warehouse" guard.
 */
export function ActiveCountWarning({ warehouseId }: { warehouseId: string }) {
  const query = useInventoryCountsQuery({
    warehouseId,
    status: 'InProgress',
    pageIndex: 0,
    pageSize: 10,
  })

  const active = useMemo(
    () => (query.data?.items ?? []).filter((count) => count.status === 'InProgress'),
    [query.data],
  )

  if (warehouseId === '' || query.isLoading || active.length === 0) {
    return null
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      يوجد جرد جارٍ لهذا المستودع بالفعل
      {active.length === 1 ? ' (' : ' ('}
      {active
        .map(
          (count) => `${INVENTORY_COUNT_STATUS_LABELS_AR[count.status]} — ${count.referenceNumber}`,
        )
        .join('، ')}
      ). لا يمكن بدء جلسة جرد أخرى قبل إكماله أو إغلاقه.
    </div>
  )
}
