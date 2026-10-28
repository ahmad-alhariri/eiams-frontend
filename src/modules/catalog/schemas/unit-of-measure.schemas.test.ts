import { beforeEach, describe, expect, it } from 'vitest'

import {
  DUPLICATE_UNIT_NAME_AR,
  hasDuplicateUnitName,
  setUnitOfMeasureUniquenessScope,
  toCreateUnitOfMeasureRequest,
  toUpdateUnitOfMeasureRequest,
  unitOfMeasureSchema,
} from './unit-of-measure.schemas'

const PIECE = { id: 'unit-1', name: 'Piece', symbol: 'pcs', unitType: 'Counting' }

beforeEach(() => {
  // The scope the form resolves against is published by the units page; each
  // case states the units it means.
  setUnitOfMeasureUniquenessScope({ units: [], editingUnitId: null })
})

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

/**
 * Two units sharing a (name, unitType) pair are indistinguishable in every
 * picker, and a material can then hold two conversions from identically
 * labelled units.
 */
describe('unitOfMeasureSchema — (name, unitType) uniqueness', () => {
  it('refuses a name another unit already uses in the same unit type', () => {
    setUnitOfMeasureUniquenessScope({ units: [PIECE], editingUnitId: null })

    const parsed = unitOfMeasureSchema.safeParse({
      name: 'Piece',
      symbol: 'pcs',
      unitType: 'Counting',
    })

    expect(parsed.success).toBe(false)
    const issue = parsed.success ? undefined : parsed.error.issues[0]
    expect(issue?.path).toEqual(['name'])
    expect(issue?.message).toBe(DUPLICATE_UNIT_NAME_AR)
  })

  it('ignores case and surrounding spaces', () => {
    setUnitOfMeasureUniquenessScope({ units: [PIECE], editingUnitId: null })

    expect(
      unitOfMeasureSchema.safeParse({ name: ' piece ', symbol: 'pcs', unitType: 'counting' })
        .success,
    ).toBe(false)
  })

  it('allows the same name in a different unit type', () => {
    setUnitOfMeasureUniquenessScope({ units: [PIECE], editingUnitId: null })

    expect(
      unitOfMeasureSchema.safeParse({ name: 'Piece', symbol: 'kg', unitType: 'Weight' }).success,
    ).toBe(true)
  })

  it('allows a unit to keep its own name while it is being edited', () => {
    setUnitOfMeasureUniquenessScope({ units: [PIECE], editingUnitId: PIECE.id })

    expect(
      unitOfMeasureSchema.safeParse({ name: 'Piece', symbol: 'pcs', unitType: 'Counting' }).success,
    ).toBe(true)
  })

  it('reports a duplicate only against the published scope', () => {
    expect(hasDuplicateUnitName({ name: 'Piece', unitType: 'Counting' }, [PIECE], null)).toBe(true)
    expect(hasDuplicateUnitName({ name: 'Piece', unitType: 'Weight' }, [PIECE], null)).toBe(false)
    expect(hasDuplicateUnitName({ name: 'Other', unitType: 'Counting' }, [PIECE], null)).toBe(false)
  })
})
