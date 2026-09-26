import { describe, expect, it } from 'vitest'

import { countLineDraftField, countLinePageStats } from './count-quantity-workspace.model'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

function line(snapshotQuantity: number, countLineId: string): InventoryCountLine {
  return {
    countLineId,
    material: { id: countLineId, displayName: `مادة ${countLineId}` },
    snapshotQuantity,
    actualQuantity: null,
    difference: 0,
    rowVersion: 1,
  }
}

describe('countLineDraftField', () => {
  it('addresses a row of the page draft array by index', () => {
    expect(countLineDraftField('actualQuantity', 0)).toBe('lines.0.actualQuantity')
    expect(countLineDraftField('reason', 12)).toBe('lines.12.reason')
  })
})

describe('countLinePageStats', () => {
  it('reports zeros for an empty page', () => {
    expect(countLinePageStats([], [])).toEqual({
      countedCount: 0,
      varianceCount: 0,
      totalVariance: 0,
    })
  })

  it('counts only the rows on the current page that hold a usable quantity', () => {
    const stats = countLinePageStats(
      [line(10, 'L1'), line(5, 'L2')],
      [
        { actualQuantity: '8', reason: '' },
        { actualQuantity: '', reason: '' },
      ],
    )

    expect(stats).toEqual({ countedCount: 1, varianceCount: 1, totalVariance: -2 })
  })

  it('excludes rejected entries from both counters and the variance sum', () => {
    const stats = countLinePageStats([line(10, 'L1')], [{ actualQuantity: 'abc', reason: '' }])
    expect(stats).toEqual({ countedCount: 0, varianceCount: 0, totalVariance: 0 })
  })

  it('treats a matching quantity as counted but not a variance', () => {
    const stats = countLinePageStats([line(10, 'L1')], [{ actualQuantity: '10', reason: '' }])
    expect(stats).toEqual({ countedCount: 1, varianceCount: 0, totalVariance: 0 })
  })

  it('survives a draft array shorter than the page', () => {
    const stats = countLinePageStats(
      [line(10, 'L1'), line(4, 'L2')],
      [{ actualQuantity: '2', reason: '' }],
    )
    expect(stats).toEqual({ countedCount: 1, varianceCount: 1, totalVariance: -8 })
  })
})
