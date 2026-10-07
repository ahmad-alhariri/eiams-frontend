import { describe, expect, it } from 'vitest'

import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'

import {
  emptyWarehouseFormValues,
  toCreateWarehouseRequest,
  toUpdateWarehouseRequest,
  toWarehouseFormValues,
  warehouseFormSchema,
} from './warehouse.schemas'

const SITE_ID = '00000000-0000-4000-8000-000000000001'
const ORG_UNIT_ID = '00000000-0000-4000-8000-000000000002'

/** A warehouse in the REAL wire shape — `name`, flat `siteId`, no `nameAr`. */
const WAREHOUSE: Warehouse = {
  id: '00000000-0000-4000-8000-000000000003',
  siteId: SITE_ID,
  organizationalUnitId: ORG_UNIT_ID,
  name: 'المستودع المركزي',
  code: 'WH-01',
  warehouseType: 'Storage',
  canHoldStock: true,
  status: 'Active',
  rowVersion: 1,
}

const validValues = {
  siteId: SITE_ID,
  code: 'WH-01',
  name: 'م',
  organizationalUnitId: ORG_UNIT_ID,
  warehouseType: 'Storage',
  canHoldStock: true,
}

describe('warehouseFormSchema', () => {
  it('accepts a one-character Arabic warehouse name permitted by the create body', () => {
    expect(warehouseFormSchema(true).safeParse(validValues).success).toBe(true)
  })

  it('rejects a warehouse name longer than the contract maximum of 200 characters', () => {
    const result = warehouseFormSchema(true).safeParse({ ...validValues, name: 'م'.repeat(201) })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('اسم المستودع يجب ألّا يتجاوز 200 محرف.')
    }
  })

  it('requires the site and the code only in create mode — the update body binds neither', () => {
    const withoutCreateOnly = { ...validValues, siteId: '', code: '' }

    const createResult = warehouseFormSchema(true).safeParse(withoutCreateOnly)
    expect(createResult.success).toBe(false)
    if (!createResult.success) {
      expect(createResult.error.issues.map((issue) => issue.path.join('.'))).toEqual([
        'siteId',
        'code',
      ])
    }

    expect(warehouseFormSchema(false).safeParse(withoutCreateOnly).success).toBe(true)
  })

  it('requires the organizational unit in both modes because both bodies bind it', () => {
    const withoutOrgUnit = { ...validValues, organizationalUnitId: '' }

    expect(warehouseFormSchema(true).safeParse(withoutOrgUnit).success).toBe(false)
    expect(warehouseFormSchema(false).safeParse(withoutOrgUnit).success).toBe(false)
  })
})

describe('toWarehouseFormValues', () => {
  it('seeds the form from the read projection, reading `name` and not `nameAr`', () => {
    const values = toWarehouseFormValues(WAREHOUSE)

    expect(values).toEqual({
      siteId: WAREHOUSE.siteId,
      code: WAREHOUSE.code,
      name: WAREHOUSE.name,
      organizationalUnitId: WAREHOUSE.organizationalUnitId,
      warehouseType: WAREHOUSE.warehouseType,
      canHoldStock: WAREHOUSE.canHoldStock,
    })
    expect(values).not.toHaveProperty('nameAr')
    expect(values).not.toHaveProperty('locationAr')
    expect(values).not.toHaveProperty('status')
  })

  it('leaves the organizational unit blank when the record carries none', () => {
    const values = toWarehouseFormValues({ ...WAREHOUSE, organizationalUnitId: null })

    expect(values.organizationalUnitId).toBe('')
  })

  it('starts a create form empty', () => {
    expect(toWarehouseFormValues(null)).toEqual(emptyWarehouseFormValues())
  })
})

describe('toCreateWarehouseRequest', () => {
  it('sends only the fields POST /warehouses binds', () => {
    const request = toCreateWarehouseRequest(validValues)

    expect(request).toEqual({
      siteId: SITE_ID,
      organizationalUnitId: ORG_UNIT_ID,
      name: 'م',
      code: 'WH-01',
      warehouseType: 'Storage',
      canHoldStock: true,
    })
    expect(Object.keys(request).sort()).toEqual([
      'canHoldStock',
      'code',
      'name',
      'organizationalUnitId',
      'siteId',
      'warehouseType',
    ])
    // Activation is a separate route and creation has no concurrency token.
    expect(request).not.toHaveProperty('status')
    expect(request).not.toHaveProperty('rowVersion')
    expect(request).not.toHaveProperty('nameAr')
  })
})

describe('toUpdateWarehouseRequest', () => {
  it('sends expectedRowVersion verbatim from the read, not a 0-based version', () => {
    const request = toUpdateWarehouseRequest(
      { ...validValues, name: 'اسم محدَّث' },
      { ...WAREHOUSE, rowVersion: 7 },
    )

    expect(request).toEqual({
      organizationalUnitId: ORG_UNIT_ID,
      name: 'اسم محدَّث',
      warehouseType: 'Storage',
      canHoldStock: true,
      expectedRowVersion: 7,
    })
    expect(request.expectedRowVersion).toBe(7)
    expect(request.expectedRowVersion).not.toBe(0)
  })

  it('drops the create-only identifiers and every field the update body does not bind', () => {
    const request = toUpdateWarehouseRequest(validValues, WAREHOUSE)

    expect(Object.keys(request).sort()).toEqual([
      'canHoldStock',
      'expectedRowVersion',
      'name',
      'organizationalUnitId',
      'warehouseType',
    ])
    expect(request).not.toHaveProperty('siteId')
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('status')
    expect(request).not.toHaveProperty('nameAr')
    expect(request).not.toHaveProperty('locationAr')
    // A freshly created row already carries rowVersion 1.
    expect(request.expectedRowVersion).toBe(1)
  })
})
