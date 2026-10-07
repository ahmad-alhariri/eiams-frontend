import type { InventoryCount, InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/** Count adjustment launch follows completion/review, never quantity entry. */
export function isCountAdjustmentEligible(status: InventoryCount['status']): boolean {
  return status === 'Completed' || status === 'Closed'
}

/** Null actuals are unentered, not zero. Difference is a server-owned read model. */
export function summarizeCountLines(lines: readonly InventoryCountLine[]) {
  const unentered = lines.filter((line) => line.actualQuantity == null)
  const entered = lines.filter((line) => line.actualQuantity != null)
  const variance = entered.filter((line) => line.difference !== 0)
  return {
    unentered,
    matching: entered.filter((line) => line.difference === 0),
    variance,
    missingReason: variance.filter((line) => (line.reason ?? '').trim() === ''),
  }
}
