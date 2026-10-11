import { describe, expect, it } from 'vitest'

import {
  materialDomainSchema,
  toCreateMaterialDomainRequest,
  toUpdateMaterialDomainRequest,
} from './material-domain.schemas'

describe('materialDomainSchema', () => {
  const values = {
    code: 'IT',
    name: 'تقنية المعلومات',
  }

  it('enforces code and name boundaries and rejects values one character over', () => {
    expect(materialDomainSchema.safeParse(values).success).toBe(true)
    expect(materialDomainSchema.safeParse({ ...values, code: 'I'.repeat(50) }).success).toBe(true)
    expect(materialDomainSchema.safeParse({ ...values, code: 'I'.repeat(51) }).success).toBe(false)
    expect(materialDomainSchema.safeParse({ ...values, code: '' }).success).toBe(false)
    expect(materialDomainSchema.safeParse({ ...values, name: 'ا'.repeat(200) }).success).toBe(true)
    expect(materialDomainSchema.safeParse({ ...values, name: 'ا'.repeat(201) }).success).toBe(false)
    expect(materialDomainSchema.safeParse({ ...values, name: '' }).success).toBe(false)
  })

  it('trims at the boundary and emits the create body the route binds', () => {
    expect(
      toCreateMaterialDomainRequest({ ...values, code: ' IT ', name: ' تقنية المعلومات ' }),
    ).toEqual({
      code: 'IT',
      name: 'تقنية المعلومات',
    })
  })

  it('drops the code, the status and any version token on update', () => {
    const request = toUpdateMaterialDomainRequest({
      ...values,
      code: ' IT ',
      name: ' تقنية المعلومات ',
    })

    // The update record binds `Name` alone: a code rename, a status and a
    // concurrency token are all rejected, so none of them may reach it.
    expect(request).toEqual({ name: 'تقنية المعلومات' })
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('status')
    expect(request).not.toHaveProperty('rowVersion')
  })
})
