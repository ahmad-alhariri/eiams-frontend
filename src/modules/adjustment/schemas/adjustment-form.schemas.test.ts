import { describe, expect, it } from 'vitest'

import {
  adjustmentFormSchema,
  createEmptyAdjustmentLine,
  isDraftFormPurpose,
  toAdjustmentDraftRequest,
  type AdjustmentFormValues,
} from './adjustment-form.schemas'

const WAREHOUSE_ID = '823e4567-e89b-42d3-a456-426614174008'
const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'
const MATERIAL_ID = '723e4567-e89b-42d3-a456-426614174007'

function validDirectCorrection(): AdjustmentFormValues {
  return {
    header: {
      warehouseId: WAREHOUSE_ID,
      purpose: 'DirectCorrection',
      reason: 'تصحيح خطأ إدخال في الكمية',
    },
    lines: [
      {
        materialId: MATERIAL_ID,
        materialNameAr: 'حاسوب مكتبي',
        quantityDelta: -2,
        reason: 'عجز مرصود أثناء التدقيق',
      },
    ],
  }
}

describe('adjustmentFormSchema (e21-t04)', () => {
  it('accepts a valid DirectCorrection draft', () => {
    const result = adjustmentFormSchema.safeParse(validDirectCorrection())
    expect(result.success).toBe(true)
  })

  it('requires a count reference for CountVariance', () => {
    const values = {
      ...validDirectCorrection(),
      header: {
        warehouseId: WAREHOUSE_ID,
        purpose: 'CountVariance' as const,
        reason: 'فروقات الجرد',
      },
    }
    const result = adjustmentFormSchema.safeParse(values)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('countId'))).toBe(true)
    }
  })

  it('passes CountVariance once the session reference is present', () => {
    const values = {
      header: {
        warehouseId: WAREHOUSE_ID,
        purpose: 'CountVariance' as const,
        reason: 'فروقات الجرد',
      },
      countId: COUNT_ID,
      lines: [
        {
          materialId: MATERIAL_ID,
          materialNameAr: 'ورق تصوير A4',
          quantityDelta: 3,
          reason: 'زيادة مرصودة بعد الجرد',
        },
      ],
    }
    expect(adjustmentFormSchema.safeParse(values).success).toBe(true)
  })

  it('forbids a count reference on DirectCorrection (D-ADJ-01)', () => {
    const values = { ...validDirectCorrection(), countId: COUNT_ID }
    const result = adjustmentFormSchema.safeParse(values)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('لا ترتبط بجلسة جرد')),
      ).toBe(true)
    }
  })

  it('rejects zero-delta lines but accepts signed decreases', () => {
    const base = validDirectCorrection()
    const zero = adjustmentFormSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0]!, quantityDelta: 0 }],
    })
    expect(zero.success).toBe(false)

    const negative = adjustmentFormSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0]!, quantityDelta: -5 }],
    })
    expect(negative.success).toBe(true)
  })

  it('requires a reason on every line', () => {
    const base = validDirectCorrection()
    const result = adjustmentFormSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0]!, reason: '   ' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty lines collection', () => {
    const result = adjustmentFormSchema.safeParse({ ...validDirectCorrection(), lines: [] })
    expect(result.success).toBe(false)
  })
})

describe('toAdjustmentDraftRequest (e21-t04)', () => {
  it('maps DirectCorrection without a countId and resets rowVersion', () => {
    const request = toAdjustmentDraftRequest(validDirectCorrection())
    expect(request).toEqual({
      warehouseId: WAREHOUSE_ID,
      purpose: 'DirectCorrection',
      reason: 'تصحيح خطأ إدخال في الكمية',
      lines: [
        {
          materialId: MATERIAL_ID,
          quantityDelta: -2,
          reason: 'عجز مرصود أثناء التدقيق',
        },
      ],
      rowVersion: 0,
    })
    expect('countId' in request).toBe(false)
  })

  it('carries the count reference only for CountVariance', () => {
    const values = {
      header: {
        warehouseId: WAREHOUSE_ID,
        purpose: 'CountVariance' as const,
        reason: 'فروقات الجرد',
      },
      countId: COUNT_ID,
      lines: [createEmptyAdjustmentLine()],
    } as AdjustmentFormValues
    // Empty line would fail validation; bypass by constructing directly.
    const request = toAdjustmentDraftRequest({
      ...values,
      lines: [
        {
          adjustmentLineId: '623e4567-e89b-42d3-a456-426614174006',
          materialId: MATERIAL_ID,
          materialNameAr: 'ورق',
          quantityDelta: 1,
          reason: 'زيادة',
        },
      ],
    })
    expect(request.countId).toBe(COUNT_ID)
    expect(request.lines[0]?.adjustmentLineId).toBe('623e4567-e89b-42d3-a456-426614174006')
  })
})

describe('isDraftFormPurpose (e21-t04)', () => {
  it('accepts launch deep-link purposes and rejects Disposal/unknown', () => {
    expect(isDraftFormPurpose('CountVariance')).toBe(true)
    expect(isDraftFormPurpose('DirectCorrection')).toBe(true)
    expect(isDraftFormPurpose('Disposal')).toBe(false)
    expect(isDraftFormPurpose(null)).toBe(false)
  })
})
