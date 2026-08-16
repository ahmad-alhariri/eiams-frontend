import { describe, expect, it } from 'vitest'

import { createMaterial, fixtureUuid } from '@/test/msw/factories'

import { materialSchema, toMaterialRequest, type MaterialFormValues } from './material.schemas'

describe('materialSchema', () => {
  const values = {
    baseUnitId: fixtureUuid(23),
    code: 'IT-HW-PC-001',
    descriptionAr: 'حاسوب للاستخدام المكتبي',
    familyId: fixtureUuid(22),
    materialKind: 'Durable' as const,
    nameAr: 'حاسوب مكتبي',
    requiresAssetNumber: false,
    status: 'Active' as const,
    trackingType: 'Quantity' as const,
  }

  it('enforces every contract length and enum in the core request', () => {
    expect(materialSchema.safeParse(values).success).toBe(true)
    expect(materialSchema.safeParse({ ...values, code: 'x'.repeat(51) }).success).toBe(false)
    expect(materialSchema.safeParse({ ...values, nameAr: 'x'.repeat(251) }).success).toBe(false)
    expect(materialSchema.safeParse({ ...values, descriptionAr: 'x'.repeat(1001) }).success).toBe(
      false,
    )
    expect(materialSchema.safeParse({ ...values, materialKind: 'Other' }).success).toBe(false)
    expect(materialSchema.safeParse({ ...values, trackingType: 'Batch' }).success).toBe(false)
  })

  it('accepts only the approved material tracking combinations', () => {
    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Consumable',
        trackingType: 'Quantity',
        requiresAssetNumber: false,
      }).success,
    ).toBe(true)
    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Durable',
        trackingType: 'Serial',
        requiresAssetNumber: false,
      }).success,
    ).toBe(true)
    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Asset',
        trackingType: 'Serial',
        requiresAssetNumber: true,
      }).success,
    ).toBe(true)

    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Consumable',
        trackingType: 'Serial',
      }).success,
    ).toBe(false)
    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Durable',
        requiresAssetNumber: true,
      }).success,
    ).toBe(false)
    expect(
      materialSchema.safeParse({
        ...values,
        materialKind: 'Asset',
        trackingType: 'Quantity',
        requiresAssetNumber: false,
      }).success,
    ).toBe(false)
  })

  it('normalizes text, emits nullable empty descriptions, and keeps the row version', () => {
    const material = createMaterial({ rowVersion: 9 })

    expect(
      toMaterialRequest(
        { ...values, code: ' IT-HW-PC-001 ', descriptionAr: '  ', nameAr: ' حاسوب مكتبي ' },
        material,
      ),
    ).toEqual({
      ...values,
      code: 'IT-HW-PC-001',
      descriptionAr: null,
      nameAr: 'حاسوب مكتبي',
      rowVersion: 9,
    })
  })

  it('starts row-version concurrency at zero when creating a material', () => {
    expect(toMaterialRequest(values, null).rowVersion).toBe(0)
  })

  it('normalizes a bypassed form value to the approved contract payload', () => {
    const bypassedValues: MaterialFormValues = {
      ...values,
      materialKind: 'Asset',
      trackingType: 'Quantity',
      requiresAssetNumber: false,
    }

    expect(toMaterialRequest(bypassedValues, null)).toMatchObject({
      materialKind: 'Asset',
      trackingType: 'Serial',
      requiresAssetNumber: true,
    })
  })
})
