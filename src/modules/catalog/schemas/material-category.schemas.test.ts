import { describe, expect, it } from 'vitest'

import {
  createMaterialCategorySchema,
  toMaterialCategoryRequest,
} from '@/modules/catalog/schemas/material-category.schemas'
import { createMaterialCategory, fixtureUuid } from '@/test/msw/factories'

describe('material category schema', () => {
  it('accepts contract length boundaries and rejects values one character over', () => {
    const category = createMaterialCategory()
    const schema = createMaterialCategorySchema([], null)
    const values = {
      domainId: category.domain.id,
      parentCategoryId: undefined,
      status: 'Active' as const,
    }

    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(50), nameAr: 'ا'.repeat(200) }).success,
    ).toBe(true)
    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(51), nameAr: 'ا'.repeat(200) }).success,
    ).toBe(false)
    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(50), nameAr: 'ا'.repeat(201) }).success,
    ).toBe(false)
  })

  it('maps the exact contract payload with the persisted row version', () => {
    const category = createMaterialCategory({ rowVersion: 9 })

    expect(
      toMaterialCategoryRequest(
        {
          code: ' IT-HW ',
          domainId: category.domain.id,
          nameAr: ' الأجهزة ',
          parentCategoryId: fixtureUuid(22),
          status: 'Inactive',
        },
        category,
      ),
    ).toEqual({
      code: 'IT-HW',
      domainId: category.domain.id,
      nameAr: 'الأجهزة',
      parentCategoryId: fixtureUuid(22),
      rowVersion: 9,
      status: 'Inactive',
    })
  })

  it('rejects unavailable and cross-domain parents', () => {
    const category = createMaterialCategory()
    const otherDomain = { id: fixtureUuid(30), displayName: 'الخدمات' }
    const parentInOtherDomain = createMaterialCategory({
      categoryId: fixtureUuid(31),
      domain: otherDomain,
    })
    const schema = createMaterialCategorySchema([category, parentInOtherDomain], null)

    expect(
      schema.safeParse({
        code: 'SERVICE',
        domainId: category.domain.id,
        nameAr: 'خدمة',
        parentCategoryId: parentInOtherDomain.categoryId,
        status: 'Active',
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        code: 'SERVICE',
        domainId: category.domain.id,
        nameAr: 'خدمة',
        parentCategoryId: fixtureUuid(40),
        status: 'Active',
      }).success,
    ).toBe(false)
  })

  it('rejects self and descendant parent selections during edit', () => {
    const category = createMaterialCategory({ categoryId: fixtureUuid(21) })
    const child = createMaterialCategory({
      categoryId: fixtureUuid(22),
      parentCategoryId: category.categoryId,
    })
    const schema = createMaterialCategorySchema([category, child], category)
    const values = {
      code: category.code,
      domainId: category.domain.id,
      nameAr: category.nameAr,
      status: category.status,
    }

    expect(schema.safeParse({ ...values, parentCategoryId: category.categoryId }).success).toBe(
      false,
    )
    expect(schema.safeParse({ ...values, parentCategoryId: child.categoryId }).success).toBe(false)
  })
})
