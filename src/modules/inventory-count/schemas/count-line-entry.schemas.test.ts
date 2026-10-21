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
  planCountLineSaves,
} from './count-line-entry.schemas'
import type { InventoryCountLine } from '@/modules/inventory-count/types/inventory-count.types'

function line(overrides: Partial<InventoryCountLine> = {}): InventoryCountLine {
  return {
    id: 'L1',
    materialId: 'm1',
    assetId: null,
    snapshotQuantity: 10,
    actualQuantity: null,
    difference: 0,
    varianceReason: null,
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

  it('seeds the stored actual and reason as the draft baseline', () => {
    expect(toCountLineDraftValues(line({ actualQuantity: 8, varianceReason: 'تالف' }))).toEqual({
      actualQuantity: '8',
      reason: 'تالف',
    })
    expect(toCountLineDraftValues(line({ actualQuantity: 10, varianceReason: null }))).toEqual({
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
    const lines = [line({ id: 'L1' }), line({ id: 'L2', actualQuantity: 4 })]
    const indexes = countDirtyLineIndexes(lines, [
      { actualQuantity: '3', reason: '' },
      { actualQuantity: '4', reason: '' },
    ])
    expect(indexes).toEqual([0])
  })
})

describe('planCountLineSaves', () => {
  it('sends only changed rows with their line id and exact actual; no per-line rowVersion', () => {
    // RESOLUTION-025 / F2: the live `/actuals` wire carries line
    // identity + the exact actual quantity only; the aggregate
    // expectedRowVersion is supplied once at the batch level. The LINE DTO
    // has no rowVersion at all, so no version-based blocking exists (F2).
    const lines = [line({ id: 'L1' }), line({ id: 'L2', actualQuantity: 4, difference: -6 })]
    const { request, blocked } = planCountLineSaves(7, lines, {
      lines: [
        { actualQuantity: '3', reason: 'نقص' },
        { actualQuantity: '4', reason: '' },
      ],
    })

    expect(request.expectedRowVersion).toBe(7)
    expect(request.actuals).toEqual([{ lineId: 'L1', actualQuantity: 3 }])
    expect(blocked).toEqual([])
    for (const entry of request.actuals) {
      expect(entry).not.toHaveProperty('rowVersion')
    }
  })

  it('plans the variance reasons typed in the same form for their own endpoints (F3)', () => {
    const lines = [
      line({ id: 'L1', varianceReason: null }), // typed a fresh reason
      line({ id: 'L2', varianceReason: 'قديمة' }), // reason unchanged -> not sent
      line({ id: 'L3', actualQuantity: 10, varianceReason: null }), // blank reason -> never sent
    ]
    const { request, reasons, blocked } = planCountLineSaves(1, lines, {
      lines: [
        { actualQuantity: '9', reason: 'نقص فعلي' },
        { actualQuantity: '10', reason: 'قديمة' },
        { actualQuantity: '10', reason: '   ' },
      ],
    })
    expect(request.actuals).toEqual([
      { lineId: 'L1', actualQuantity: 9 },
      { lineId: 'L2', actualQuantity: 10 },
    ])
    expect(reasons).toEqual([
      { lineId: 'L1', reason: 'نقص فعلي' },
      // L2: server reason already matches the draft — nothing to send.
    ])
    expect(blocked).toEqual([])
  })

  it('does not emit a per-line reason on the actuals wire, and never a blank one', () => {
    const { request, reasons } = planCountLineSaves(1, [line()], {
      lines: [{ actualQuantity: '3', reason: '   ' }],
    })
    expect(request.actuals[0]).toEqual({ lineId: 'L1', actualQuantity: 3 })
    expect(request.actuals[0]).not.toHaveProperty('reason')
    expect(reasons).toEqual([])
  })

  it('blocks, rather than silently drops, a changed row whose quantity is not usable yet', () => {
    const { request, blocked } = planCountLineSaves(1, [line()], {
      lines: [{ actualQuantity: '-1', reason: '' }],
    })
    expect(request.actuals).toEqual([])
    expect(blocked).toEqual([{ index: 0, kind: 'no-quantity' }])
  })

  it('blocks, rather than drops, a changed row the operator left blank', () => {
    const lines = [line({ id: 'L1', actualQuantity: 5 })]
    const { request, blocked } = planCountLineSaves(1, lines, {
      lines: [{ actualQuantity: '', reason: 'تصحيح' }],
    })
    expect(request.actuals).toEqual([])
    expect(blocked).toEqual([{ index: 0, kind: 'no-quantity' }])
  })

  it('keeps sendable and blocked rows separate within one page', () => {
    const lines = [
      line({ id: 'L1' }),
      line({ id: 'L2', actualQuantity: 2 }),
      line({ id: 'L3' }),
    ]
    const { request, blocked } = planCountLineSaves(5, lines, {
      lines: [
        { actualQuantity: '3', reason: '' }, // L1 changed, sendable
        { actualQuantity: '', reason: '' }, // L2 cleared -> blocked
        { actualQuantity: '9', reason: '' }, // L3 changed, sendable
      ],
    })
    expect(request.actuals).toEqual([
      { lineId: 'L1', actualQuantity: 3 },
      { lineId: 'L3', actualQuantity: 9 },
    ])
    expect(blocked).toEqual([{ index: 1, kind: 'no-quantity' }])
  })

  it('produces an empty batch and an empty block list when nothing changed', () => {
    const lines = [line({ id: 'L1', actualQuantity: 3 })]
    const { request, blocked, reasons } = planCountLineSaves(1, lines, {
      lines: [{ actualQuantity: '3', reason: '' }],
    })
    expect(request.actuals).toEqual([])
    expect(blocked).toEqual([])
    expect(reasons).toEqual([])
  })
})

describe('toCountLineEntryFormValues', () => {
  it('seeds one draft per server row', () => {
    const values = toCountLineEntryFormValues([
      line({ id: 'L1' }),
      line({ id: 'L2', actualQuantity: 2, snapshotQuantity: 5, varianceReason: 'فرق' }),
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
