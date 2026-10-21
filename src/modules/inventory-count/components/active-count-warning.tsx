import { useWarehouseFreezeStatusQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR } from '@/modules/inventory-count/types/inventory-count.types'

/**
 * Warehouse-freeze advisory (F9), read from the contract's own endpoint
 * `GET /warehouses/{warehouseId}/inventory-freeze-status` — never inferred
 * from a list scan. Shown before starting (planning form picks a warehouse)
 * and while a count is InProgress on the detail page.
 *
 * Severity follows the payload: `isPostingBlocked`/`isProvisional` → the
 * session is blocking stock movement; a lone `hasSoftFreezeWarning` → an
 * advisory only. Active counts render with the freeze policy straight from
 * the DTO (`INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR`), never hard-coded.
 */
export function ActiveCountWarning({ warehouseId }: { warehouseId: string }) {
  const query = useWarehouseFreezeStatusQuery(warehouseId)
  const status = query.data

  if (warehouseId === '' || query.isLoading || status === undefined) {
    return null
  }

  // `isProvisional` means the evaluation is provisional (the freeze state may move as
  // counts start and stop); it is NOT a severity signal. Only `isPostingBlocked` blocks
  // stock movement, and a SoftFreeze count is an advisory only (R10).
  const hasAnySignal =
    status.isPostingBlocked || status.hasSoftFreezeWarning || status.activeCounts.length > 0
  if (!hasAnySignal) {
    return null
  }

  const isBlocking = status.isPostingBlocked
  if (status.activeCounts.length === 0) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        هذا المستودع مجمّد حالياً؛ حرك المخزون ممنوعة حتى انتهاء التجميد. أعد تحميل الصفحة بعد
        انتهاء الجلسة.
      </div>
    )
  }

  return (
    <div
      role="alert"
      className={
        isBlocking
          ? 'rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          : 'rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning'
      }
    >
      {isBlocking
        ? 'حركة المخزون محجوبة في هذا المستودع بسبب جلسة جرد قائمة، ولا يمكن بدء جلسة أخرى قبل إتمامها أو إغلاقها:'
        : 'تنبيه تجميد مرن (SoftFreeze): توجد جلسة جرد قائمة على هذا المستودع؛ قد تُرفض حركة المخزون الحساسة لهذا المستودع أثناء الجلسة:'}
      <ul className="mt-1 list-inside list-disc">
        {status.activeCounts.map((count) => (
          <li key={count.countId}>
            جرد جارٍ بسياسة {INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[count.freezePolicy]}
          </li>
        ))}
      </ul>
    </div>
  )
}
