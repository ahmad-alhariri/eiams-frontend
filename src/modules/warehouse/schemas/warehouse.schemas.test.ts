import { describe, expect, it } from 'vitest'

import { warehouseSchema } from './warehouse.schemas'

const validValues = {
  siteId: '00000000-0000-4000-8000-000000000001',
  code: 'WH-01',
  nameAr: 'م',
  locationAr: '',
  status: 'Active' as const,
}

describe('warehouseSchema', () => {
  it('accepts a one-character Arabic warehouse name permitted by WarehouseUpsertRequest', () => {
    expect(warehouseSchema.safeParse(validValues).success).toBe(true)
  })

  it('rejects a warehouse name longer than the contract maximum of 200 characters', () => {
    const result = warehouseSchema.safeParse({ ...validValues, nameAr: 'م'.repeat(201) })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('اسم المستودع يجب ألّا يتجاوز 200 محرف.')
    }
  })
})
