import { describe, expect, it } from 'vitest'

import { createWarehouseMaterialSetting, fixtureUuid } from '@/test/msw/factories'
import {
  toWarehouseMaterialSettingRequest,
  warehouseMaterialSettingSchema,
} from './warehouse-material-settings.schemas'

describe('warehouseMaterialSettingSchema', () => {
  const validValues = {
    materialId: fixtureUuid(62),
    minQuantity: '2',
    maxQuantity: '10',
    status: 'Active' as const,
  }

  it('accepts a complete valid setting', () => {
    expect(warehouseMaterialSettingSchema.safeParse(validValues).success).toBe(true)
  })

  it('accepts empty thresholds as "no limit"', () => {
    expect(
      warehouseMaterialSettingSchema.safeParse({
        materialId: fixtureUuid(62),
        minQuantity: '',
        maxQuantity: '',
        status: 'Active',
      }).success,
    ).toBe(true)
  })

  it('accepts only one threshold set', () => {
    expect(
      warehouseMaterialSettingSchema.safeParse({
        materialId: fixtureUuid(62),
        minQuantity: '5',
        maxQuantity: '',
        status: 'Active',
      }).success,
    ).toBe(true)
  })

  it('rejects negative and malformed quantities', () => {
    for (const minQuantity of ['-1', '1.2345', '12.3.4', 'abc', '1e3']) {
      expect(
        warehouseMaterialSettingSchema.safeParse({ ...validValues, minQuantity }).success,
      ).toBe(false)
    }
    for (const maxQuantity of ['-1', '1.2345', '12.3.4', 'abc', '1e3']) {
      expect(
        warehouseMaterialSettingSchema.safeParse({ ...validValues, maxQuantity }).success,
      ).toBe(false)
    }
  })

  it('rejects maxQuantity below minQuantity', () => {
    const result = warehouseMaterialSettingSchema.safeParse({
      ...validValues,
      minQuantity: '10',
      maxQuantity: '5',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('maxQuantity'))).toBe(true)
    }
  })

  it('rejects a missing material id', () => {
    expect(
      warehouseMaterialSettingSchema.safeParse({ ...validValues, materialId: 'not-a-uuid' })
        .success,
    ).toBe(false)
  })

  it('rejects an invalid status', () => {
    expect(
      warehouseMaterialSettingSchema.safeParse({ ...validValues, status: 'Other' }).success,
    ).toBe(false)
  })
})

describe('toWarehouseMaterialSettingRequest', () => {
  it('maps form values to the contract request with the existing row version', () => {
    const existing = createWarehouseMaterialSetting({ rowVersion: 7 })
    const request = toWarehouseMaterialSettingRequest(
      {
        materialId: fixtureUuid(62),
        minQuantity: '2',
        maxQuantity: '10',
        status: 'Active',
      },
      existing,
    )
    expect(request).toEqual({
      materialId: fixtureUuid(62),
      minQuantity: 2,
      maxQuantity: 10,
      rowVersion: 7,
      status: 'Active',
    })
  })

  it('maps empty thresholds to null and defaults row version to 0 for new settings', () => {
    const request = toWarehouseMaterialSettingRequest(
      {
        materialId: fixtureUuid(62),
        minQuantity: '',
        maxQuantity: '',
        status: 'Active',
      },
      null,
    )
    expect(request).toEqual({
      materialId: fixtureUuid(62),
      minQuantity: null,
      maxQuantity: null,
      rowVersion: 0,
      status: 'Active',
    })
  })
})
