import { describe, expect, it } from 'vitest'

import type { Material } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'
import { createMaterial } from '@/test/msw/factories'
import { toMaterialRequest, type MaterialFormValues } from './material.schemas'

describe('materialFormSchema', () => {
  const values: MaterialFormValues = {
    code: 'IT-HW-PC-001',
    nameAr: 'حاسوب مكتبي',
    descriptionAr: 'حاسوب للاستخدام المكتبي',
    materialFamilyId: fixtureUuid(22),
    unitId: fixtureUuid(23),
    nominalConversionFactor: 1,
    materialKind: 'Consumable',
    status: 'Active',
    parentMaterialId: undefined,
  }

  it('maps form values to a valid upsert request', () => {
    const material = createMaterial({
      rowVersion: 0,
    }) as unknown as Material

    const request = toMaterialRequest(values, material)

    expect(request.code).toBe('IT-HW-PC-001')
    expect(request.nameAr).toBe('حاسوب مكتبي')
    expect(request.materialFamilyId).toBe(fixtureUuid(22))
    expect(request.unitId).toBe(fixtureUuid(23))
    expect(request.materialKind).toBe('Consumable')
    expect(request.nominalConversionFactor).toBe(1)
    expect(request.requiresAssetNumber).toBe(false)
    expect(request.rowVersion).toBe(0)
  })
})
