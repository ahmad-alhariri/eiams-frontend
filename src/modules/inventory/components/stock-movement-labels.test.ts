import { describe, expect, it } from 'vitest'

import { STOCK_MOVEMENT_TYPE_LABELS_AR, stockMovementTypeLabelAr } from './stock-movement-labels'

describe('stock movement labels', () => {
  it('covers every generated canonical stock-movement type in Arabic', () => {
    expect(STOCK_MOVEMENT_TYPE_LABELS_AR).toEqual({
      AdjustmentIn: 'تسوية بالزيادة',
      AdjustmentOut: 'تسوية بالنقص',
      Issue: 'صرف',
      Opening: 'رصيد افتتاحي',
      Receipt: 'استلام',
      TransferIn: 'تحويل وارد',
      TransferOut: 'تحويل صادر',
    })
  })

  it('does not introduce a legacy Return movement type', () => {
    expect(stockMovementTypeLabelAr('Receipt')).toBe('استلام')
    expect('Return' in STOCK_MOVEMENT_TYPE_LABELS_AR).toBe(false)
  })
})
