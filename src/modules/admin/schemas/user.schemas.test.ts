import { describe, expect, it } from 'vitest'

import { userFormSchema } from './user.schemas'

/**
 * The four seeded role ids the backend serves for the well-known roles. They are
 * .NET `Guid` values whose RFC-9562 version and variant bits are zero, so they FAIL
 * `z.uuid()` in Zod 4. Validating them with `z.uuid()` made a correctly selected role
 * read as invalid while the control displayed its Arabic name, and the create-user
 * form could not be submitted. Fixtures that generate version-4 UUIDs never exposed
 * this, which is why these ids are pinned here explicitly.
 */
const SEEDED_ROLE_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
]

const base = {
  email: 'keeper@eiams.local',
  username: 'keeper',
  firstName: 'خوري',
  lastName: 'وائل',
  status: 'Active' as const,
  password: 'Password123!',
  scopeType: 'Enterprise' as const,
  scopeId: '',
}

describe('userFormSchema create mode', () => {
  it.each(SEEDED_ROLE_IDS)('accepts the seeded role id %s', (roleId) => {
    const result = userFormSchema(true).safeParse({ ...base, roleId })
    expect(result.success).toBe(true)
  })

  it('rejects a value that is not an identifier at all', () => {
    const result = userFormSchema(true).safeParse({ ...base, roleId: 'not-a-role' })
    expect(result.success).toBe(false)
  })

  it('rejects a scope identifier that is not one', () => {
    const result = userFormSchema(true).safeParse({
      ...base,
      roleId: SEEDED_ROLE_IDS[2],
      scopeType: 'Warehouse',
      scopeId: 'nope',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a scoped assignment whose target is an identifier', () => {
    const result = userFormSchema(true).safeParse({
      ...base,
      roleId: SEEDED_ROLE_IDS[2],
      scopeType: 'Warehouse',
      scopeId: '00000000-0000-0000-0000-0000000000aa',
    })
    expect(result.success).toBe(true)
  })
})
