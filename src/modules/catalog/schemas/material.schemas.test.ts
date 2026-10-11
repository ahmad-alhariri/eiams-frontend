import { describe, expect, it } from 'vitest'

import { fixtureUuid } from '@/test/msw/factories'
import type { Material } from '@/modules/catalog/types/catalog.types'

import {
  materialFormSchema,
  toCreateMaterialRequest,
  toUpdateMaterialRequest,
  type MaterialFormValues,
} from './material.schemas'

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: fixtureUuid(24),
    familyId: fixtureUuid(22),
    nameAr: 'حاسوب مكتبي',
    nameEn: 'Desktop computer',
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 3,
    attributes: null,
    status: 'Active',
    materialDomainId: fixtureUuid(20),
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: fixtureUuid(23),
    baseUnitSymbol: 'EA',
    ...overrides,
  }
}

const values: MaterialFormValues = {
  code: 'IT-HW-PC-001',
  nameAr: 'حاسوب مكتبي',
  nameEn: 'Desktop computer',
  familyId: fixtureUuid(22),
  baseUnitId: fixtureUuid(23),
  materialKind: 'Consumable',
  trackingType: 'Quantity',
  hasExpiry: false,
  attributes: null,
}

describe('materialFormSchema', () => {
  it('accepts the complete create contract', () => {
    const parsed = materialFormSchema.safeParse(values)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.materialKind).toBe('Consumable')
    expect(parsed.data?.trackingType).toBe('Quantity')
  })

  it('accepts every material kind, including Durable, and every tracking type', () => {
    for (const materialKind of ['Consumable', 'Durable', 'Asset'] as const) {
      expect(materialFormSchema.safeParse({ ...values, materialKind }).success).toBe(true)
    }
    for (const trackingType of ['Quantity', 'Serial'] as const) {
      expect(materialFormSchema.safeParse({ ...values, trackingType }).success).toBe(true)
    }
  })

  it('rejects unknown kinds and tracking types rather than silently coercing them', () => {
    expect(materialFormSchema.safeParse({ ...values, materialKind: 'Perishable' }).success).toBe(
      false,
    )
    expect(materialFormSchema.safeParse({ ...values, trackingType: 'Batch' }).success).toBe(false)
  })

  it('accepts attributes as a JSON object and rejects arrays and bare scalars', () => {
    expect(materialFormSchema.safeParse({ ...values, attributes: '{"cpu":"i7"}' }).success).toBe(
      true,
    )
    expect(materialFormSchema.safeParse({ ...values, attributes: null }).success).toBe(true)
    expect(materialFormSchema.safeParse({ ...values, attributes: '' }).success).toBe(true)

    // The backend stores `attributes` as text and rejects an array or a
    // primitive with 400 REQUEST_VALIDATION_FAILED.
    expect(materialFormSchema.safeParse({ ...values, attributes: '[]' }).success).toBe(false)
    expect(materialFormSchema.safeParse({ ...values, attributes: '[1,2]' }).success).toBe(false)
    expect(materialFormSchema.safeParse({ ...values, attributes: '5' }).success).toBe(false)
    expect(materialFormSchema.safeParse({ ...values, attributes: '"x"' }).success).toBe(false)
    expect(materialFormSchema.safeParse({ ...values, attributes: 'true' }).success).toBe(false)
    expect(materialFormSchema.safeParse({ ...values, attributes: '{' }).success).toBe(false)
  })

  it('normalizes an empty attributes field to null before validating it', () => {
    const parsed = materialFormSchema.safeParse({ ...values, attributes: '   ' })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.attributes).toBeNull()
  })

  it('maps the create body the route binds, with no version token', () => {
    const request = toCreateMaterialRequest({
      ...values,
      code: ' IT-HW-PC-001 ',
      nameAr: ' حاسوب مكتبي ',
      nameEn: ' Desktop computer ',
    })

    expect(request).toEqual({
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      nameEn: 'Desktop computer',
      familyId: fixtureUuid(22),
      baseUnitId: fixtureUuid(23),
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      attributes: null,
    })
    // There is no prior classification to check on a create, and the create
    // record does not bind the field.
    expect(request).not.toHaveProperty('catalogVersion')
    expect(request).not.toHaveProperty('expectedCatalogVersion')
    // `requiresAssetNumber` is SERVER-DERIVED: readable, never sendable.
    expect(request).not.toHaveProperty('requiresAssetNumber')
  })

  it('maps the update body with the version echoed verbatim from the read', () => {
    const material = makeMaterial({ catalogVersion: 7, materialKind: 'Asset' })

    const request = toUpdateMaterialRequest(
      {
        ...values,
        code: ' IT-HW-PC-999 ',
        familyId: fixtureUuid(99),
        baseUnitId: fixtureUuid(98),
        nameAr: ' حاسوب محمول ',
        nameEn: ' Laptop ',
        materialKind: 'Asset',
        trackingType: 'Serial',
        hasExpiry: true,
        attributes: '{"serial":"ABC"}',
      },
      material,
    )

    expect(request).toEqual({
      nameAr: 'حاسوب محمول',
      nameEn: 'Laptop',
      materialKind: 'Asset',
      trackingType: 'Serial',
      hasExpiry: true,
      attributes: '{"serial":"ABC"}',
      expectedCatalogVersion: 7,
    })
  })

  it('keeps the update body free of the create-only fields and of rowVersion', () => {
    const request = toUpdateMaterialRequest(values, makeMaterial())

    // `familyId`, `baseUnitId`, `code` and `status` are not updatable, and
    // `rowVersion` is a field no catalog entity except Material's
    // `catalogVersion` equivalent ever had.
    for (const key of [
      'familyId',
      'baseUnitId',
      'code',
      'status',
      'rowVersion',
      'catalogVersion',
      'requiresAssetNumber',
    ]) {
      expect(request).not.toHaveProperty(key)
    }
  })
})
