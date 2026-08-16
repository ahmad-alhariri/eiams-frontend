import { describe, expect, it } from 'vitest'

import { createMaterialUnitConversion, fixtureUuid } from '@/test/msw/factories'

import {
  materialUnitConversionSchema,
  toMaterialUnitConversionCreateRequest,
  toMaterialUnitConversionUpdateRequest,
} from './material-unit-conversion.schemas'

describe('material unit-conversion schema', () => {
  const validValues = { fromUnitId: fixtureUuid(26), factor: '12', status: 'Active' as const }

  it('preserves every valid DECIMAL(18,6) character without number coercion', () => {
    for (const factor of [
      '0.125',
      '999999999999.999999',
      '999999999999.000001',
      '123456789012.123456',
    ]) {
      const parsed = materialUnitConversionSchema.safeParse({ ...validValues, factor })
      expect(parsed.success).toBe(true)
      if (parsed.success) expect(parsed.data.factor).toBe(factor)
    }

    for (const factor of ['0', '0.000000', '-1', '0.1234567', '1000000000000', '12.', '1e3']) {
      expect(materialUnitConversionSchema.safeParse({ ...validValues, factor }).success).toBe(false)
    }
  })

  it('maps only contract-owned fields for creation', () => {
    expect(toMaterialUnitConversionCreateRequest(validValues)).toEqual({
      fromUnitId: validValues.fromUnitId,
      factor: '12',
    })
  })

  it('preserves the historical factor and row version while archiving a used conversion', () => {
    const conversion = createMaterialUnitConversion({
      factor: '12',
      rowVersion: 7,
      usedInPostedDocuments: true,
    })

    expect(
      toMaterialUnitConversionUpdateRequest(
        { ...validValues, factor: '10', status: 'Inactive' },
        conversion,
      ),
    ).toEqual({ factor: '12', rowVersion: 7, status: 'Inactive' })
  })
})
