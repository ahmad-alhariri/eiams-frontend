import { describe, expect, it } from 'vitest'

import type { UserRoleScopeProjection } from '@/modules/admin/types/role.types'

import {
  ROLE_SCOPE_TYPES,
  toReplaceUserRoleScopeRequest,
  toUserRoleScopeFormValues,
  userRoleScopeSchema,
} from './user-role-scopes.schemas'

const ROLE_ID = '00000000-0000-4000-8000-0000000000a1'
const SITE_ID = '00000000-0000-4000-8000-000000000071'

function assignment(overrides: Partial<UserRoleScopeProjection> = {}): UserRoleScopeProjection {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    roleId: ROLE_ID,
    roleName: 'WH_MGR',
    scopeType: 'Enterprise',
    scopeId: null,
    rowVersion: 4,
    ...overrides,
  }
}

describe('userRoleScopeSchema', () => {
  it('maps an enterprise assignment to a null scope identifier and keeps its version', () => {
    const values = toUserRoleScopeFormValues(assignment({ rowVersion: 7 }))

    expect(values).toEqual({
      assignment: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: '' },
      expectedRowVersion: 7,
    })
    expect(toReplaceUserRoleScopeRequest(userRoleScopeSchema.parse(values))).toEqual({
      roleId: ROLE_ID,
      scopeType: 'Enterprise',
      scopeId: null,
      expectedRowVersion: 7,
    })
  })

  it('keeps a real scope identifier for a site assignment', () => {
    const values = userRoleScopeSchema.parse({
      assignment: { roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID },
      expectedRowVersion: 3,
    })

    expect(toReplaceUserRoleScopeRequest(values)).toEqual({
      roleId: ROLE_ID,
      scopeType: 'Site',
      scopeId: SITE_ID,
      expectedRowVersion: 3,
    })
  })

  it('starts a user with no assignment at version zero for the first write', () => {
    // The backend's ReplaceUserRoleScopeCommandHandler treats a non-zero
    // expectedRowVersion against a missing assignment as RowVersionMismatch(..., 0),
    // so the first write must submit 0.
    const values = toUserRoleScopeFormValues(null)

    expect(values).toEqual({
      assignment: { roleId: '', scopeType: 'Enterprise', scopeId: '' },
      expectedRowVersion: 0,
    })
    expect(userRoleScopeSchema.safeParse(values).success).toBe(false)
  })

  it('requires a role, a valid scoped identifier, and a non-negative version', () => {
    const result = userRoleScopeSchema.safeParse({
      assignment: { roleId: '', scopeType: 'Site', scopeId: 'site-1' },
      expectedRowVersion: -1,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['assignment', 'roleId'] }),
        expect.objectContaining({ path: ['assignment', 'scopeId'] }),
        expect.objectContaining({ path: ['expectedRowVersion'] }),
      ]),
    )
    // UI copy is Arabic-first (ui-design.md): the browser must never show the
    // English key or the raw Zod default.
    expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['يجب اختيار دور صالح.', 'يجب اختيار نطاق صالح.']),
    )
  })

  it('accepts an empty scope identifier for Enterprise only', () => {
    const enterprise = userRoleScopeSchema.safeParse({
      assignment: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: '' },
      expectedRowVersion: 1,
    })
    const warehouse = userRoleScopeSchema.safeParse({
      assignment: { roleId: ROLE_ID, scopeType: 'Warehouse', scopeId: '' },
      expectedRowVersion: 1,
    })

    expect(enterprise.success).toBe(true)
    expect(warehouse.success).toBe(false)
  })

  it('never offers OrganizationalUnit as an assignment scope', () => {
    expect(ROLE_SCOPE_TYPES).toEqual(['Enterprise', 'Site', 'Warehouse'])
  })
})
