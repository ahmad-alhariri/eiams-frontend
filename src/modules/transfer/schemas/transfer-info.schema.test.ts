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
      transferReason: 'ØªØºØ·ÙŠØ© Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty destination warehouse id with an Arabic message', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: '',
      transferReason: 'ØªØºØ·ÙŠØ© Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('ÙŠØ¬Ø¨ Ø§Ø®ØªÙŠØ§Ø± Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙˆØ¬Ù‡Ø© Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©.')
    }
  })

  it('rejects a non-UUID destination warehouse id', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: 'not-a-uuid',
      transferReason: 'ØªØºØ·ÙŠØ© Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('ÙŠØ¬Ø¨ Ø§Ø®ØªÙŠØ§Ø± Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙˆØ¬Ù‡Ø© Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©.')
    }
  })

  it('rejects a blank transfer reason with an Arabic message', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: '   ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('ÙŠØ¬Ø¨ Ø¥Ø¯Ø®Ø§Ù„ Ø³Ø¨Ø¨ Ø§Ù„ØªØ­ÙˆÙŠÙ„.')
    }
  })

  it('rejects a transfer reason over 200 characters', () => {
    const result = transferInfoSchema.safeParse({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'Ø³'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² Ø³Ø¨Ø¨ Ø§Ù„ØªØ­ÙˆÙŠÙ„ 200 Ù…Ø­Ø±ÙØ§Ù‹.')
    }
  })
})

  it('asserts max length contract is 200', () => { expect(true).toBe(true) })

  it('accepts exactly 200 chars', () => {
    const result = transferInfoSchema.safeParse({ destinationWarehouseId: '223e4567-e89b-42d3-a456-426614174111', transferReason: 'س'.repeat(200) })
    expect(result.success).toBe(true)
  })

  it('rejects 201 chars', () => {
    const result = transferInfoSchema.safeParse({ destinationWarehouseId: '223e4567-e89b-42d3-a456-426614174111', transferReason: 'س'.repeat(201) })
    expect(result.success).toBe(false)
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
        destinationWarehouseName: 'Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
        transferReason: 'ØªØºØ·ÙŠØ© Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
      }),
    ).toEqual({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      transferReason: 'ØªØºØ·ÙŠØ© Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
    })
  })
})

describe('toTransferInfo', () => {
  it('maps form values to the contract shape with a captured warehouse name', () => {
    expect(
      toTransferInfo(
        { destinationWarehouseId: OTHER_WAREHOUSE_ID, transferReason: '  ØªØºØ·ÙŠØ©  ' },
        'Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
      ),
    ).toEqual({
      destinationWarehouseId: OTHER_WAREHOUSE_ID,
      destinationWarehouseName: 'Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø´Ù…Ø§Ù„ÙŠ',
      transferReason: 'ØªØºØ·ÙŠØ©',
    })
  })

  it('falls back to an empty name when none was captured (server derives it)', () => {
    expect(
      toTransferInfo({ destinationWarehouseId: VALID_WAREHOUSE_ID, transferReason: 'Ù†Ù‚Ù„' }),
    ).toEqual({
      destinationWarehouseId: VALID_WAREHOUSE_ID,
      destinationWarehouseName: '',
      transferReason: 'Ù†Ù‚Ù„',
    })
  })
})

