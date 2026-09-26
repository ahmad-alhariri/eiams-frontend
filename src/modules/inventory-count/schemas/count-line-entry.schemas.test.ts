import { describe, expect, it } from 'vitest'

import {
  countDirtyLineIndexes,
  countLineDifference,
  countLineDraftSchema,
  isCountLineDraftDirty,
  isValidActualQuantityInput,
  parseActualQuantity,
  toCountLineDraftValues,
  toCountLineEntryFormValues,
  toCountLineUpdateRequest,
} from './count-line-entry.schemas'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

function line(overrides: Partial<InventoryCountLine> = {}): InventoryCountLine {
  return {
    countLineId: 'L1',
    material: { id: 'm1', displayName: 'حاسوب مكتبي' },
    snapshotQuantity: 10,
    actualQuantity: null,
    difference: 0,
    rowVersion: 4,
    ...overrides,
  }
}

describe('isValidActualQuantityInput', () => {
  it.each([
    ['0', true],
    ['10', true],
    ['10.5', true],
    ['0.001', true],
    [' 7 ', true],
    ['', false],
    ['-1', false],
    ['abc', false],
    ['1e3', false],
    ['1,5', false],
    ['Infinity', false],
    ['999999999999.999999', false],
  ])('classifies %j as %s', (value, expected) => {
    expect(isValidActualQuantityInput(value)).toBe(expected)
  })
})

describe('parseActualQuantity', () => {
  it('reports an untouched line as empty', () => {
    expect(parseActualQuantity('   ')).toEqual({ status: 'empty' })
  })

  it('reports a rejected entry as invalid rather than coercing it', () => {
    expect(parseActualQuantity('-4')).toEqual({ status: 'invalid' })
    expect(parseActualQuantity('x')).toEqual({ status: 'invalid' })
  })

  it('reports a usable entry as counted', () => {
    expect(parseActualQuantity('12.5')).toEqual({ status: 'counted', value: 12.5 })
  })
})

describe('countLineDraftSchema', () => {
  it('accepts a blank quantity (a line that has not been counted yet)', () => {
    expect(countLineDraftSchema.safeParse({ actualQuantity: '', reason: '' }).success).toBe(true)
  })

  it('rejects a negative or non-numeric quantity in Arabic', () => {
    const negative = countLineDraftSchema.safeParse({ actualQuantity: '-2', reason: '' })
    expect(negative.success).toBe(false)
    expect(negative.error?.issues[0]?.message).toBe('أدخل كمية فعلية رقمية غير سالبة.')

    expect(countLineDraftSchema.safeParse({ actualQuantity: 'abc', reason: '' }).success).toBe(
      false,
    )
  })

  it('caps the variance reason length', () => {
    const result = countLineDraftSchema.safeParse({
      actualQuantity: '1',
      reason: 'س'.repeat(201),
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('يجب ألا يتجاوز سبب الفرق 200 محرف.')
  })
})

describe('toCountLineDraftValues', () => {
  it('seeds an uncounted line as empty', () => {
    expect(toCountLineDraftValues(line())).toEqual({ actualQuantity: '', reason: '' })
  })

  it('seeds the stored reason only when a variance already exists', () => {
    expect(toCountLineDraftValues(line({ actualQuantity: 8, reason: 'تالف' }))).toEqual({
      actualQuantity: '8',
      reason: 'تالف',
    })
    expect(toCountLineDraftValues(line({ actualQuantity: 10, reason: 'تالف' }))).toEqual({
      actualQuantity: '10',
      reason: '',
    })
  })
})

describe('isCountLineDraftDirty', () => {
  it('ignores whitespace-only differences', () => {
    expect(
      isCountLineDraftDirty(
        { actualQuantity: '10', reason: '' },
        { actualQuantity: ' 10 ', reason: '' },
      ),
    ).toBe(false)
  })

  it('treats clearing a counted quantity and typing a reason as changes', () => {
    expect(
      isCountLineDraftDirty(
        { actualQuantity: '10', reason: '' },
        { actualQuantity: '', reason: '' },
      ),
    ).toBe(true)
    expect(
      isCountLineDraftDirty(
        { actualQuantity: '10', reason: '' },
        { actualQuantity: '10', reason: 'فرق' },
      ),
    ).toBe(true)
  })
})

describe('countDirtyLineIndexes', () => {
  it('reports only the rows the operator changed', () => {
    const lines = [
      line({ countLineId: 'L1' }),
      line({ countLineId: 'L2', actualQuantity: 4, rowVersion: 2 }),
    ]
    const indexes = countDirtyLineIndexes(lines, [
      { actualQuantity: '3', reason: '' },
      { actualQuantity: '4', reason: '' },
    ])
    expect(indexes).toEqual([0])
  })
})

describe('toCountLineUpdateRequest', () => {
  it('sends only changed rows with their server row version', () => {
    const lines = [
      line({ countLineId: 'L1' }),
      line({ countLineId: 'L2', actualQuantity: 4, rowVersion: 9, difference: -6 }),
    ]
    const request = toCountLineUpdateRequest(7, lines, {
      lines: [
        { actualQuantity: '3', reason: 'نقص' },
        { actualQuantity: '4', reason: '' },
      ],
    })

    expect(request.countRowVersion).toBe(7)
    expect(request.lines).toEqual([
      { countLineId: 'L1', actualQuantity: 3, rowVersion: 4, reason: 'نقص' },
    ])
  })

  it('omits an empty reason rather than sending a blank string', () => {
    const request = toCountLineUpdateRequest(1, [line()], {
      lines: [{ actualQuantity: '3', reason: '   ' }],
    })
    expect(request.lines[0]).toEqual({ countLineId: 'L1', actualQuantity: 3, rowVersion: 4 })
  })

  it('skips a changed row whose quantity is not usable yet (partial entry)', () => {
    const request = toCountLineUpdateRequest(1, [line()], {
      lines: [{ actualQuantity: '-1', reason: '' }],
    })
    expect(request.lines).toEqual([])
  })

  it('defaults a missing line rowVersion to 0', () => {
    const withoutRowVersion: InventoryCountLine = {
      countLineId: 'L9',
      material: { id: 'm9', displayName: 'مادة' },
      snapshotQuantity: 3,
      actualQuantity: null,
      difference: 0,
    }
    const request = toCountLineUpdateRequest(1, [withoutRowVersion], {
      lines: [{ actualQuantity: '3', reason: '' }],
    })
    expect(request.lines[0]?.rowVersion).toBe(0)
  })
})

describe('toCountLineEntryFormValues', () => {
  it('seeds one draft per server row', () => {
    const values = toCountLineEntryFormValues([
      line({ countLineId: 'L1' }),
      line({ countLineId: 'L2', actualQuantity: 2, snapshotQuantity: 5, reason: 'فرق' }),
    ])
    expect(values.lines).toEqual([
      { actualQuantity: '', reason: '' },
      { actualQuantity: '2', reason: 'فرق' },
    ])
  })
})

describe('countLineDifference', () => {
  it('shows nothing for an uncounted or rejected entry', () => {
    expect(countLineDifference(line(), '')).toBeNull()
    expect(countLineDifference(line(), 'abc')).toBeNull()
  })

  it('previews the live difference', () => {
    expect(countLineDifference(line(), '7')).toBe(-3)
    expect(countLineDifference(line(), '10')).toBe(0)
  })
})
