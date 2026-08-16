import { describe, expect, it } from 'vitest'

import { toUnitOfMeasureRequest, unitOfMeasureSchema } from './unit-of-measure.schemas'

describe('unitOfMeasureSchema', () => {
  const validValues = { code: 'EA', nameAr: 'قطعة', symbolAr: 'قطعة', status: 'Active' as const }

  it('requires the complete v1 unit reference and trims values at the request boundary', () => {
    expect(unitOfMeasureSchema.safeParse(validValues).success).toBe(true)
    expect(unitOfMeasureSchema.safeParse({ ...validValues, code: '' }).success).toBe(false)

    expect(toUnitOfMeasureRequest({ ...validValues, code: ' EA ' }, null)).toEqual({
      ...validValues,
      rowVersion: 0,
    })
  })
})
