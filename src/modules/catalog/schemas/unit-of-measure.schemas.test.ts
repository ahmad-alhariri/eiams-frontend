import { describe, expect, it } from 'vitest'

import {
  toCreateUnitOfMeasureRequest,
  toUpdateUnitOfMeasureRequest,
  unitOfMeasureSchema,
} from './unit-of-measure.schemas'

describe('unitOfMeasureSchema', () => {
  const validValues = {
    name: 'قطعة',
    symbol: 'EA',
    unitType: 'Quantity',
  }

  it('requires the complete contract unit reference', () => {
    expect(unitOfMeasureSchema.safeParse(validValues).success).toBe(true)
    expect(unitOfMeasureSchema.safeParse({ ...validValues, name: '' }).success).toBe(false)
    expect(unitOfMeasureSchema.safeParse({ ...validValues, symbol: '' }).success).toBe(false)
    expect(unitOfMeasureSchema.safeParse({ ...validValues, unitType: '' }).success).toBe(false)
    expect(unitOfMeasureSchema.safeParse({ ...validValues, name: 'ن'.repeat(201) }).success).toBe(
      false,
    )
    expect(unitOfMeasureSchema.safeParse({ ...validValues, symbol: 'S'.repeat(51) }).success).toBe(
      false,
    )
  })

  it('binds neither the fictional code nor the free-text conversion fields', () => {
    // The projection is `{ id, name, symbol, unitType, status }`: `code`,
    // `nameAr`, `descriptionAr`, `nominalConversionFactor` and `baseUnitId` are
    // fields the backend does not serve, and the request rejects them. Zod
    // strips an unknown key rather than rejecting it, so the assertion is on the
    // parsed output: a field the schema never emits is a field the mapper can
    // never send.
    const parsed = unitOfMeasureSchema.safeParse({
      ...validValues,
      code: 'EA',
      nameAr: 'قطعة',
      descriptionAr: null,
      nominalConversionFactor: 1,
      baseUnitId: null,
      status: 'Active',
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(validValues)
  })

  it('trims at the request boundary for both create and update', () => {
    const trimmed = { name: 'قطعة', symbol: 'EA', unitType: 'Quantity' }

    expect(toCreateUnitOfMeasureRequest({ ...validValues, name: ' قطعة ' })).toEqual(trimmed)
    expect(toUpdateUnitOfMeasureRequest({ ...validValues, name: ' قطعة ' })).toEqual(trimmed)
  })
})
