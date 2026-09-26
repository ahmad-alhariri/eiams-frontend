import { describe, expect, it } from 'vitest'

import {
  createMaterialCategorySchema,
  toMaterialCategoryRequest,
} from '@/modules/catalog/schemas/material-category.schemas'
import type { MaterialCategory } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    materialCategoryId: fixtureUuid(21),
    code: 'CAT',
    nameAr: 'تصنيف',
    parentCategoryId: null,
    parentCategory: null,
    materialDomainId: fixtureUuid(20),
    materialDomain: { id: fixtureUuid(20), displayName: 'تقنية المعلومات' },
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

describe('material category schema', () => {
  it('accepts contract length boundaries and rejects values one character over', () => {
    const category = makeCategory()
    const schema = createMaterialCategorySchema([], null)
    const values = {
      materialDomainId: category.materialDomainId,
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
    const category = makeCategory({ rowVersion: 9 })

    expect(
      toMaterialCategoryRequest(
        {
          code: ' IT-HW ',
          materialDomainId: category.materialDomainId,
          nameAr: ' الأجهزة ',
          parentCategoryId: fixtureUuid(22),
          status: 'Inactive',
        },
        category,
      ),
    ).toEqual({
      code: 'IT-HW',
      materialDomainId: category.materialDomainId,
      nameAr: 'الأجهزة',
      parentCategoryId: fixtureUuid(22),
      rowVersion: 9,
      status: 'Inactive',
    })
  })

  it('rejects unavailable and cross-domain parents', () => {
    const category = makeCategory()
    const otherDomainId = fixtureUuid(30)
    const parentInOtherDomain = makeCategory({
      materialCategoryId: fixtureUuid(31),
      materialDomainId: otherDomainId,
      materialDomain: { id: otherDomainId, displayName: 'الخدمات' },
    })
    const schema = createMaterialCategorySchema([category, parentInOtherDomain], null)

    expect(
      schema.safeParse({
        code: 'SERVICE',
        materialDomainId: category.materialDomainId,
        nameAr: 'خدمة',
        parentCategoryId: parentInOtherDomain.materialCategoryId,
        status: 'Active',
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        code: 'SERVICE',
        materialDomainId: category.materialDomainId,
        nameAr: 'خدمة',
        parentCategoryId: fixtureUuid(40),
        status: 'Active',
      }).success,
    ).toBe(false)
  })

  it('rejects self and descendant parent selections during edit', () => {
    const category = makeCategory({ materialCategoryId: fixtureUuid(21) })
    const child = makeCategory({
      materialCategoryId: fixtureUuid(22),
      parentCategoryId: category.materialCategoryId,
    })
    const schema = createMaterialCategorySchema([category, child], category)
    const values = {
      code: category.code,
      materialDomainId: category.materialDomainId,
      nameAr: category.nameAr,
      status: category.status,
    }

    expect(
      schema.safeParse({ ...values, parentCategoryId: category.materialCategoryId }).success,
    ).toBe(false)
    expect(
      schema.safeParse({ ...values, parentCategoryId: child.materialCategoryId }).success,
    ).toBe(false)
  })
})
