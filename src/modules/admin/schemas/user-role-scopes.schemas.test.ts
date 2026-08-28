import { describe, expect, it } from 'vitest'

import { createUserRoleScope, createUserSummary } from '@/test/msw/factories'

import {
  toReplaceRoleScopesRequest,
  toUserRoleScopesFormValues,
  userRoleScopesSchema,
} from './user-role-scopes.schemas'

const ROLE_ID = '00000000-0000-4000-8000-0000000000a1'
const SITE_ID = '00000000-0000-4000-8000-000000000071'

describe('userRoleScopesSchema', () => {
  it('preserves the authoritative user version and maps enterprise scope to null', () => {
    const values = toUserRoleScopesFormValues(createUserSummary({ rowVersion: 7 }), [
      createUserRoleScope({
        role: { ...createUserRoleScope().role, roleId: ROLE_ID },
        scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
      }),
    ])

    expect(toReplaceRoleScopesRequest(userRoleScopesSchema.parse(values))).toEqual({
      assignments: [{ roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null }],
      rowVersion: 7,
    })
  })

  it('requires a real server version and UUIDs for roles and scoped assignments', () => {
    const result = userRoleScopesSchema.safeParse({
      assignments: [{ roleId: '', scopeType: 'Site', scopeId: 'site-1' }],
      rowVersion: 0,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['assignments', 0, 'roleId'] }),
        expect.objectContaining({ path: ['assignments', 0, 'scopeId'] }),
        expect.objectContaining({ path: ['rowVersion'] }),
      ]),
    )
  })

  it('keeps a valid non-enterprise scope identifier in the request', () => {
    const values = userRoleScopesSchema.parse({
      assignments: [{ roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID }],
      rowVersion: 3,
    })

    expect(toReplaceRoleScopesRequest(values).assignments[0]?.scopeId).toBe(SITE_ID)
  })
})
