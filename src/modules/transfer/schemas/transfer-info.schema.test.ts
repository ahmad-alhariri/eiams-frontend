import { describe, expect, it } from 'vitest'

import {
  fromTransferInfo,
  toTransferInfo,
  transferInfoSchema,
} from '@/modules/transfer/schemas/transfer-info.schema'

const VALID_WAREHOUSE_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_WAREHOUSE_ID = '223e4567-e89b-42d3-a456-426614174111'

describe('transferInfoSchema', () => {
  it('accepts a destination warehouse id and reason', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'تغطية احتياج الفرع الشمالي',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty destination warehouse id with an Arabic message', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: '',
      transferReason: 'تغطية احتياج الفرع الشمالي',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار مستودع الوجهة من القائمة.')
    }
  })

  it('rejects a non-UUID destination warehouse id', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: 'not-a-uuid',
      transferReason: 'تغطية احتياج الفرع الشمالي',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار مستودع الوجهة من القائمة.')
    }
  })

  it('rejects a blank transfer reason with an Arabic message', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: '   ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب إدخال سبب التحويل.')
    }
  })

  it('rejects a transfer reason over 500 characters', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'س'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز سبب التحويل 500 محرفاً.')
    }
  })
})

describe('fromTransferInfo', () => {
  it('defaults to blank fields when the petal is missing', () => {
    expect(fromTransferInfo(undefined)).toEqual({
      destinationWarehouseId: '',
      transferReason: '',
    })
    expect(fromTransferInfo(null)).toEqual({
      destinationWarehouseId: '',
      transferReason: '',
    })
  })

  it('seeds values from a persisted petal', () => {
    expect(
      fromTransferInfo({
        destinationWarehouseId: OTHER_WAREHOUSE_ID,
        destinationWarehouseName: 'مستودع الفرع الشمالي',
        transferReason: 'تغطية احتياج الفرع الشمالي',
      }),
    ).toEqual({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'تغطية احتياج الفرع الشمالي',
    })
  })
})

describe('toTransferInfo', () => {
  it('maps form values to the contract shape with a captured warehouse name', () => {
    expect(
      toTransferInfo(
        { destinationWarehouseId: OTHER_WAREHOUSE_ID, transferReason: '  تغطية  ' },
        'مستودع الفرع الشمالي',
      ),
    ).toEqual({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      destinationWarehouseName: 'مستودع الفرع الشمالي',
      transferReason: 'تغطية',
    })
  })

  it('falls back to an empty name when none was captured (server derives it)', () => {
    expect(
      toTransferInfo({ destinationWarehouseId: VALID_WAREHOUSE_ID, transferReason: 'نقل' }),
    ).toEqual({
      destinationWarehouseId: VALID_WAREHOUSE_ID,
      destinationWarehouseName: '',
      transferReason: 'نقل',
    })
  })
})
