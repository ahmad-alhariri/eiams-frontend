import { describe, expect, it } from 'vitest'

import { fixtureUuid } from '@/test/msw/factories'
import {
  materialFamilySchema,
  toCreateMaterialFamilyRequest,
  toUpdateMaterialFamilyRequest,
} from './material-family.schemas'

describe('materialFamilySchema', () => {
  const values = {
    categoryId: fixtureUuid(21),
    code: 'IT-HW-PC',
    name: 'الحواسيب',
  }

  it('enforces category, code, and name constraints', () => {
    expect(materialFamilySchema.safeParse(values).success).toBe(true)
    expect(materialFamilySchema.safeParse({ ...values, categoryId: 'not-a-uuid' }).success).toBe(
      false,
    )
    expect(materialFamilySchema.safeParse({ ...values, categoryId: '' }).success).toBe(false)
    expect(materialFamilySchema.safeParse({ ...values, code: 'x'.repeat(51) }).success).toBe(false)
    expect(materialFamilySchema.safeParse({ ...values, name: 'x'.repeat(201) }).success).toBe(false)
  })

  it('trims user-entered text and emits the create body the route binds', () => {
    expect(
      toCreateMaterialFamilyRequest({ ...values, code: ' IT-HW-PC ', name: ' الحواسيب ' }),
    ).toEqual({
      categoryId: values.categoryId,
      code: 'IT-HW-PC',
      name: 'الحواسيب',
    })
  })

  it('drops the category and any version token on update', () => {
    // Re-categorising a family is not exposed by `PUT`; the record binds
    // `Name, Code` and the aggregate is not versioned.
    const request = toUpdateMaterialFamilyRequest({
      ...values,
      categoryId: fixtureUuid(99),
      code: ' IT-HW-PC ',
      name: ' الحواسيب ',
    })

    expect(request).toEqual({ code: 'IT-HW-PC', name: 'الحواسيب' })
    expect(request).not.toHaveProperty('categoryId')
    expect(request).not.toHaveProperty('rowVersion')
  })
})
