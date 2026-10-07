import type { CountLineDraftValues } from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import {
  countLineDifference,
  parseActualQuantity,
} from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/**
 * Pure helpers shared by the quantity-entry workspace's table columns and its
 * page summary. Kept out of the component so the difference/counted math is
 * unit-testable without a React tree.
 */

export type CountLineDraftFieldName = 'actualQuantity' | 'reason'

/**
 * RHF field path for one row of the page's `lines` array. Index-based (not
 * `countLineId`-based) so the form stays fully typed by `useForm` and never
 * has to escape a UUID into a dot-path.
 */
export function countLineDraftField(
  field: CountLineDraftFieldName,
  index: number,
): `lines.${number}.${CountLineDraftFieldName}` {
  return `lines.${index}.${field}`
}

export interface CountLinePageStats {
  /** Rows on this page with a usable counted quantity. */
  readonly countedCount: number
  /** Rows on this page whose entered quantity differs from the snapshot. */
  readonly varianceCount: number
  /** Sum of the differences on this page. */
  readonly totalVariance: number
}

const EMPTY_PAGE_STATS: CountLinePageStats = {
  countedCount: 0,
  varianceCount: 0,
  totalVariance: 0,
}

/** Summary counters for the rows currently on screen. */
export function countLinePageStats(
  lines: readonly InventoryCountLine[],
  drafts: readonly (CountLineDraftValues | undefined)[],
): CountLinePageStats {
  if (lines.length === 0) {
    return EMPTY_PAGE_STATS
  }

  let countedCount = 0
  let varianceCount = 0
  let totalVariance = 0
  for (const [index, line] of lines.entries()) {
    const draft = drafts[index]
    if (draft === undefined || parseActualQuantity(draft.actualQuantity).status !== 'counted') {
      continue
    }
    countedCount += 1
    const difference = countLineDifference(line, draft.actualQuantity)
    if (difference === null) {
      continue
    }
    if (difference !== 0) {
      varianceCount += 1
    }
    totalVariance += difference
  }

  return { countedCount, varianceCount, totalVariance }
}
