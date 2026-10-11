import { describe, expect, it } from 'vitest'

import { fixtureUuid } from '@/test/msw/factories'
import {
  materialUnitConversionSchema,
  toCreateMaterialUnitConversionRequest,
  toUpdateMaterialUnitConversionRequest,
} from './material-unit-conversion.schemas'

describe('material unit-conversion schema', () => {
  const validValues = {
    fromUnitId: fixtureUuid(26),
    factor: 12,
  }

  it('rejects zero, negative, and non-numeric conversion factors', () => {
    expect(materialUnitConversionSchema.safeParse({ ...validValues, factor: 0 }).success).toBe(
      false,
    )
    expect(materialUnitConversionSchema.safeParse({ ...validValues, factor: -1 }).success).toBe(
      false,
    )
    expect(
      materialUnitConversionSchema.safeParse({ ...validValues, factor: Number.NaN }).success,
    ).toBe(false)
  })

  it('accepts positive numeric conversion factors', () => {
    expect(materialUnitConversionSchema.safeParse({ ...validValues, factor: 0.5 }).success).toBe(
      true,
    )
  })

  it('requires a unit and never emits a status the record does not carry', () => {
    expect(materialUnitConversionSchema.safeParse({ ...validValues, fromUnitId: '' }).success).toBe(
      false,
    )
    expect(
      materialUnitConversionSchema.safeParse({ ...validValues, fromUnitId: 'x' }).success,
    ).toBe(false)

    // A conversion has no status: its lifecycle is DELETE, not status change.
    // Zod strips an unknown key rather than rejecting it, so the assertion is on
    // the parsed output — a silent `status: 'Active'` in a body is exactly the
    // defect this keeps out.
    const parsed = materialUnitConversionSchema.safeParse({ ...validValues, status: 'Active' })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ fromUnitId: validValues.fromUnitId, factor: 12 })
  })

  it('maps a create request with the material own base unit', () => {
    expect(toCreateMaterialUnitConversionRequest(validValues, fixtureUuid(60))).toEqual({
      fromUnitId: validValues.fromUnitId,
      toBaseUnitId: fixtureUuid(60),
      factor: 12,
    })
  })

  it('maps an update request to the factor alone', () => {
    // Correcting a factor does not re-point the units: `fromUnitId` and
    // `toBaseUnitId` mean remove-and-add, not update.
    const request = toUpdateMaterialUnitConversionRequest({ ...validValues, factor: 10 })

    expect(request).toEqual({ factor: 10 })
    expect(request).not.toHaveProperty('fromUnitId')
    expect(request).not.toHaveProperty('toBaseUnitId')
    expect(request).not.toHaveProperty('materialId')
    expect(request).not.toHaveProperty('status')
    expect(request).not.toHaveProperty('rowVersion')
  })
})
