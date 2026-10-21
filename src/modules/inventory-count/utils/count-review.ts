import type {
  CountStatus,
  InventoryCountLine,
} from '@/modules/inventory-count/types/inventory-count.types'

/** Count adjustment launch follows completion/review, never quantity entry. */
export function isCountAdjustmentEligible(status: CountStatus): boolean {
  return status === 'Completed' || status === 'Closed'
}

/**
 * Null actuals are unentered, not zero. The `difference` is a server-owned read
 * model and is null-guarded (`?? 0`) at every bucket — never recomputed or
 * crashed on. The count's TOTALS come from the server `summary`; this buckets
 * only for the per-line review lists and the completion gate.
 */
export function summarizeCountLines(lines: readonly InventoryCountLine[]) {
  const unentered = lines.filter((line) => line.actualQuantity == null)
  const entered = lines.filter((line) => line.actualQuantity != null)
  const variance = entered.filter((line) => (line.difference ?? 0) !== 0)
  return {
    unentered,
    matching: entered.filter((line) => (line.difference ?? 0) === 0),
    variance,
    missingReason: variance.filter((line) => (line.varianceReason ?? '').trim() === ''),
  }
}
