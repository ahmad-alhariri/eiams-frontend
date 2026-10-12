import { describe, expect, it } from 'vitest'

import {
  toCreateWarehouseMaterialSettingRequest,
  toSetWarehouseMaterialSettingStatusRequest,
  toUpdateWarehouseMaterialSettingRequest,
  warehouseMaterialSettingSchema,
} from '@/modules/warehouse/schemas/warehouse-material-settings.schemas'

const WAREHOUSE_ID = '3a1f0c62-6d4b-4a7e-9c1d-8b2e5f7a0d31'
const MATERIAL_ID = 'a6704844-50e7-42b7-a5ff-7bca005e0803'

const BASE_FORM = {
  materialId: MATERIAL_ID,
  minQuantity: '2',
  maxQuantity: '10',
  status: 'Active' as const,
}

describe('warehouseMaterialSettingSchema', () => {
  it('accepts the canonical form: a uuid material, decimal thresholds, and a status', () => {
    const result = warehouseMaterialSettingSchema.safeParse(BASE_FORM)
    expect(result.success).toBe(true)
  })

  it('rejects an out-of-range or negative decimal', () => {
    const result = warehouseMaterialSettingSchema.safeParse({
      ...BASE_FORM,
      minQuantity: '-1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when max < min and pins the error to maxQuantity', () => {
    const result = warehouseMaterialSettingSchema.safeParse({
      ...BASE_FORM,
      minQuantity: '5',
      maxQuantity: '2',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const path = result.error.issues[0]?.path
      expect(path).toEqual(['maxQuantity'])
    }
  })
})

describe('toCreateWarehouseMaterialSettingRequest', () => {
  it('binds warehouseId + materialId + numeric thresholds verbatim', () => {
    const request = toCreateWarehouseMaterialSettingRequest(BASE_FORM, WAREHOUSE_ID)
    expect(request).toEqual({
      warehouseId: WAREHOUSE_ID,
      materialId: MATERIAL_ID,
      minQuantity: 2,
      maxQuantity: 10,
    })
  })

  it('throws if a threshold is empty (the wire requires both min and max)', () => {
    expect(() =>
      toCreateWarehouseMaterialSettingRequest({ ...BASE_FORM, maxQuantity: '' }, WAREHOUSE_ID),
    ).toThrow()
  })
})

describe('toUpdateWarehouseMaterialSettingRequest', () => {
  it('omits warehouseId and materialId: the route names them', () => {
    const request = toUpdateWarehouseMaterialSettingRequest(BASE_FORM)
    expect(request).toEqual({ minQuantity: 2, maxQuantity: 10 })
  })
})

describe('toSetWarehouseMaterialSettingStatusRequest', () => {
  it('maps the RecordStatus to the int ordinal the route binds (Active=0, Inactive=1)', () => {
    // The controller binds `int Status` and casts to the enum server-side, so a
    // string can never ride the wire — the ordinal is the honest body.
    expect(toSetWarehouseMaterialSettingStatusRequest({ status: 'Active' })).toEqual({ status: 0 })
    expect(toSetWarehouseMaterialSettingStatusRequest({ status: 'Inactive' })).toEqual({
      status: 1,
    })
  })
})
