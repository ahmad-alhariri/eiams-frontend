import { describe, expect, it } from 'vitest'

import {
  toReplaceRoleScopeRequest,
  toUserRoleScopeFormValues,
  userRoleScopeSchema,
} from './user-role-scopes.schemas'

const ROLE_ID = '00000000-0000-4000-8000-0000000000a1'
const SITE_ID = '00000000-0000-4000-8000-000000000071'
const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000072'

describe('userRoleScopeSchema (singular, D-SRS-01)', () => {
  it('accepts a valid Enterprise assignment with a null scope', () => {
    const values = userRoleScopeSchema.parse({
      roleId: ROLE_ID,
      scopeType: 'Enterprise',
      scopeId: null,
    })

    expect(toReplaceRoleScopeRequest(values)).toEqual({
      roleId: ROLE_ID,
      scopeType: 'Enterprise',
      scopeId: null,
    })
  })

  it('accepts valid Site and Warehouse assignments', () => {
    expect(
      userRoleScopeSchema.parse({
        roleId: ROLE_ID,
        scopeType: 'Site',
        scopeId: SITE_ID,
      }).scopeId,
    ).toBe(SITE_ID)

    expect(
      userRoleScopeSchema.parse({
        roleId: ROLE_ID,
        scopeType: 'Warehouse',
        scopeId: WAREHOUSE_ID,
      }).scopeId,
    ).toBe(WAREHOUSE_ID)
  })

  it('rejects a missing role with the Arabic message', () => {
    const result = userRoleScopeSchema.safeParse({
      roleId: '',
      scopeType: 'Site',
      scopeId: SITE_ID,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['roleId'], message: 'يجب اختيار دور صالح.' }),
      ]),
    )
  })

  it('rejects an invalid Site scope identifier with the Arabic message', () => {
    const result = userRoleScopeSchema.safeParse({
      roleId: ROLE_ID,
      scopeType: 'Site',
      scopeId: 'site-1',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['scopeId'], message: 'يجب إدخال معرّف نطاق صالح.' }),
      ]),
    )
  })

  it('maps an Enterprise form value with an empty scope to a null transport scope', () => {
    const request = toReplaceRoleScopeRequest(
      userRoleScopeSchema.parse({ roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: '' }),
    )

    expect(request.scopeId).toBeNull()
  })

  it('returns the exact singular shape with no assignments/rowVersion keys', () => {
    const request = toReplaceRoleScopeRequest(
      userRoleScopeSchema.parse({ roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID }),
    )

    expect(Object.keys(request).sort()).toEqual(['roleId', 'scopeId', 'scopeType'])
    expect(request).not.toHaveProperty('assignments')
    expect(request).not.toHaveProperty('rowVersion')
  })

  it('maps a null projection to empty defaults and a scope projection back to form values', () => {
    expect(toUserRoleScopeFormValues(null)).toEqual({
      roleId: '',
      scopeType: 'Enterprise',
      scopeId: null,
    })

    expect(
      toUserRoleScopeFormValues({
        role: { roleId: ROLE_ID, nameAr: 'أمين مستودع' },
        scope: { scopeType: 'Site', scopeId: SITE_ID, displayName: 'الموقع' },
      }),
    ).toEqual({ roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID })
  })
})
