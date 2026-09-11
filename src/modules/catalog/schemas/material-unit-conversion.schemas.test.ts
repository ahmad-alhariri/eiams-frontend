import { describe, expect, it } from 'vitest'

import { createMaterialUnitConversion, fixtureUuid } from '@/test/msw/factories'
import type { MaterialUnitConversion } from '@/modules/catalog/types/catalog.types'

import {
  materialUnitConversionSchema,
  toMaterialUnitConversionRequest,
} from './material-unit-conversion.schemas'

describe('material unit-conversion schema', () => {
  const validValues = {
    unitId: fixtureUuid(26),
    conversionFactor: 12,
    status: 'Active' as const,
  }

  it('rejects zero, negative, and non-numeric conversion factors', () => {
    expect(
      materialUnitConversionSchema.safeParse({ ...validValues, conversionFactor: 0 }).success,
    ).toBe(false)
    expect(
      materialUnitConversionSchema.safeParse({ ...validValues, conversionFactor: -1 }).success,
    ).toBe(false)
  })

  it('accepts positive numeric conversion factors', () => {
    expect(
      materialUnitConversionSchema.safeParse({ ...validValues, conversionFactor: 0.5 }).success,
    ).toBe(true)
  })

  it('maps a create request without an existing conversion', () => {
    expect(toMaterialUnitConversionRequest(validValues, fixtureUuid(60), null)).toEqual({
      materialId: fixtureUuid(60),
      unitId: validValues.unitId,
      conversionFactor: 12,
      rowVersion: 0,
      status: 'Active',
    })
  })

  it('preserves the row version from the existing conversion on update', () => {
    const conversion: MaterialUnitConversion = {
      ...createMaterialUnitConversion(),
      materialUnitConversionId: fixtureUuid(33),
      materialId: fixtureUuid(60),
      material: { id: fixtureUuid(60), displayName: 'حاسوب' },
      unitId: fixtureUuid(26),
      unit: { id: fixtureUuid(26), displayName: 'كرتونة' },
      conversionFactor: 12,
      rowVersion: 7,
    }

    expect(
      toMaterialUnitConversionRequest(
        { ...validValues, conversionFactor: 10, status: 'Inactive' },
        fixtureUuid(60),
        conversion,
      ),
    ).toEqual({
      materialId: fixtureUuid(60),
      unitId: fixtureUuid(26),
      conversionFactor: 10,
      rowVersion: 7,
      status: 'Inactive',
    })
  })
})
