import { describe, expect, it } from 'vitest'

import { AUDIT_MAX_RANGE_DAYS, auditRangeError } from './audit.types'

/**
 * The rule mirrors the server's `DateRangeLimits.IsValid`:
 * both bounds present, the lower one strictly before the upper one, and a span
 * of at most 366 days. The live 400 for a broken range reads
 * «FromUtc and ToUtc must form a half-open range no longer than 366 days.»
 */
describe('auditRangeError', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  const to = new Date('2026-01-02T00:00:00.000Z')

  it('accepts an absent range', () => {
    expect(auditRangeError({ from: undefined, to: undefined })).toBeNull()
  })

  it('accepts a bounded range inside the maximum span', () => {
    expect(auditRangeError({ from, to })).toBeNull()
  })

  it('rejects a half-filled range on the missing bound', () => {
    expect(auditRangeError({ from, to: undefined })).toEqual({
      field: 'to',
      messageAr: 'حدّد «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» معًا.',
    })
    expect(auditRangeError({ from: undefined, to })).toEqual({
      field: 'from',
      messageAr: 'حدّد «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» معًا.',
    })
  })

  it('rejects an inverted range on the upper bound', () => {
    expect(auditRangeError({ from: to, to: from })).toEqual({
      field: 'to',
      messageAr: 'يجب أن يكون «إلى تاريخ الإنشاء» بعد «من تاريخ الإنشاء».',
    })
  })

  it('rejects a range whose bounds are equal', () => {
    expect(auditRangeError({ from, to: from })?.field).toBe('to')
  })

  it('accepts exactly the maximum span and rejects one millisecond more', () => {
    const maxSpan = new Date(from.getTime() + AUDIT_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
    expect(auditRangeError({ from, to: maxSpan })).toBeNull()

    const tooLong = new Date(maxSpan.getTime() + 1)
    expect(auditRangeError({ from, to: tooLong })).toEqual({
      field: 'to',
      messageAr: `نطاق «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» لا يتجاوز ${AUDIT_MAX_RANGE_DAYS} يومًا.`,
    })
  })
})
