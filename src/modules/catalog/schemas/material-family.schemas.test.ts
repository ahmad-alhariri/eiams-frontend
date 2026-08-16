import { describe, expect, it } from 'vitest'

import { toMaterialFamilyRequest, materialFamilySchema } from './material-family.schemas'

describe('materialFamilySchema', () => {
  const values = {
    categoryId: '00000000-0000-4000-8000-000000000021',
    code: 'IT-HW-PC',
    nameAr: 'الحواسيب',
    status: 'Active' as const,
  }

  it('enforces v1 category, code, and Arabic name constraints', () => {
    expect(materialFamilySchema.safeParse(values).success).toBe(true)
    expect(materialFamilySchema.safeParse({ ...values, categoryId: 'not-a-uuid' }).success).toBe(
      false,
    )
    expect(materialFamilySchema.safeParse({ ...values, code: 'x'.repeat(51) }).success).toBe(false)
    expect(materialFamilySchema.safeParse({ ...values, nameAr: 'x'.repeat(201) }).success).toBe(
      false,
    )
  })

  it('trims user-entered text and initializes the concurrency version for creates', () => {
    expect(
      toMaterialFamilyRequest({ ...values, code: ' IT-HW-PC ', nameAr: ' الحواسيب ' }, null),
    ).toEqual({
      ...values,
      rowVersion: 0,
    })
  })
})
