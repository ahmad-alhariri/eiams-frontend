import { describe, expect, it } from 'vitest'

import { fixtureUuid } from '@/test/msw/factories'
import type { MaterialCategory } from '@/modules/catalog/types/catalog.types'

import {
  createMaterialCategorySchema,
  toCreateMaterialCategoryRequest,
  toMoveMaterialCategoryRequest,
  toUpdateMaterialCategoryRequest,
} from './material-category.schemas'

function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    id: fixtureUuid(21),
    materialDomainId: fixtureUuid(20),
    parentCategoryId: null,
    name: 'تصنيف',
    code: 'CAT',
    status: 'Active',
    ...overrides,
  }
}

describe('material category schema', () => {
  it('accepts contract length boundaries and rejects values one character over', () => {
    const category = makeCategory()
    const schema = createMaterialCategorySchema([], null)
    const values = {
      materialDomainId: category.materialDomainId,
      parentCategoryId: null,
    }

    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(50), name: 'ا'.repeat(200) }).success,
    ).toBe(true)
    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(51), name: 'ا'.repeat(200) }).success,
    ).toBe(false)
    expect(
      schema.safeParse({ ...values, code: 'C'.repeat(50), name: 'ا'.repeat(201) }).success,
    ).toBe(false)
  })

  it('emits the domain, the parent and the trimmed text on create', () => {
    const category = makeCategory()

    expect(
      toCreateMaterialCategoryRequest({
        code: ' IT-HW ',
        materialDomainId: category.materialDomainId,
        name: ' الأجهزة ',
        parentCategoryId: fixtureUuid(22),
      }),
    ).toEqual({
      code: 'IT-HW',
      materialDomainId: category.materialDomainId,
      name: 'الأجهزة',
      parentCategoryId: fixtureUuid(22),
    })
  })

  it('keeps the domain and the parent off the update body', () => {
    // The update record binds `Name, Code` and nothing else: re-domaining is not
    // exposed by this route, and re-parenting is its own command.
    const request = toUpdateMaterialCategoryRequest({
      code: ' IT-HW ',
      materialDomainId: fixtureUuid(31),
      name: ' الأجهزة ',
      parentCategoryId: fixtureUuid(40),
    })

    expect(request).toEqual({ code: 'IT-HW', name: 'الأجهزة' })
    expect(request).not.toHaveProperty('materialDomainId')
    expect(request).not.toHaveProperty('parentCategoryId')
  })

  it('sends a move command only when the parent actually moved', () => {
    const parent = fixtureUuid(22)
    const category = makeCategory({ parentCategoryId: parent })

    expect(
      toMoveMaterialCategoryRequest(
        {
          code: category.code,
          materialDomainId: category.materialDomainId,
          name: category.name,
          parentCategoryId: parent,
        },
        category,
      ),
    ).toBeNull()
    expect(
      toMoveMaterialCategoryRequest(
        {
          code: category.code,
          materialDomainId: category.materialDomainId,
          name: category.name,
          parentCategoryId: null,
        },
        category,
      ),
    ).toEqual({ parentCategoryId: null })
  })

  it('rejects unavailable and cross-domain parents', () => {
    const category = makeCategory()
    const otherDomainId = fixtureUuid(30)
    const parentInOtherDomain = makeCategory({
      id: fixtureUuid(31),
      materialDomainId: otherDomainId,
    })
    const schema = createMaterialCategorySchema([category, parentInOtherDomain], null)

    expect(
      schema.safeParse({
        code: 'SERVICE',
        materialDomainId: category.materialDomainId,
        name: 'خدمة',
        parentCategoryId: parentInOtherDomain.id,
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        code: 'SERVICE',
        materialDomainId: category.materialDomainId,
        name: 'خدمة',
        parentCategoryId: fixtureUuid(40),
      }).success,
    ).toBe(false)
  })

  it('rejects self and descendant parent selections during edit', () => {
    const category = makeCategory({ id: fixtureUuid(21) })
    const child = makeCategory({ id: fixtureUuid(22), parentCategoryId: category.id })
    const schema = createMaterialCategorySchema([category, child], category)
    const values = {
      code: category.code,
      materialDomainId: category.materialDomainId,
      name: category.name,
    }

    expect(schema.safeParse({ ...values, parentCategoryId: category.id }).success).toBe(false)
    expect(schema.safeParse({ ...values, parentCategoryId: child.id }).success).toBe(false)
  })
})
