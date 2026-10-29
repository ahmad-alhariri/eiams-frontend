import { describe, expect, it } from 'vitest'

import {
  toTransferInfo,
  transferInfoSchema,
  TRANSFER_REASON_MAX_LENGTH,
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

  it('rejects a transfer reason over 200 characters', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'س'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز سبب التحويل 200 محرفاً.')
    }
  })
})

it('asserts max length contract is 200', () => {
  expect(TRANSFER_REASON_MAX_LENGTH).toBe(200)
})

it('accepts exactly 200 chars', () => {
  const result = transferInfoSchema.safeParse({
    destinationWarehouseId: '223e4567-e89b-42d3-a456-426614174111',
    transferReason: 'س'.repeat(200),
  })
  expect(result.success).toBe(true)
})

it('rejects 201 chars', () => {
  const result = transferInfoSchema.safeParse({
    destinationWarehouseId: '223e4567-e89b-42d3-a456-426614174111',
    transferReason: 'س'.repeat(201),
  })
  expect(result.success).toBe(false)
})

describe('toTransferInfo', () => {
  it('maps form values to the live write body', () => {
    expect(
      toTransferInfo({
        destinationWarehouseId: OTHER_WAREHOUSE_ID,
        transferReason: '  تغطية  ',
      }),
    ).toEqual({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'تغطية',
    })
  })

  it('carries no display name: the live petal is an id and a reason', () => {
    expect(
      toTransferInfo({ destinationWarehouseId: VALID_WAREHOUSE_ID, transferReason: 'نقل' }),
    ).toEqual({
      destinationWarehouseId: VALID_WAREHOUSE_ID,
      transferReason: 'نقل',
    })
  })
})
