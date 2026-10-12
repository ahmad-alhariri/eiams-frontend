import { describe, expect, it } from 'vitest'

import {
  buildRoleLabelMap,
  resolveRoleLabelAr,
  type RoleLabelSource,
} from '@/modules/admin/utils/role-labels'

const ROLE_A: RoleLabelSource = {
  id: '00000000-0000-4000-8000-0000000000a1',
  nameAr: 'مدير النظام',
}
const ROLE_B: RoleLabelSource = {
  id: '00000000-0000-4000-8000-0000000000b2',
  nameAr: 'مدير المستودع',
}

describe('buildRoleLabelMap', () => {
  it('maps every role id to its Arabic label', () => {
    const labels = buildRoleLabelMap([ROLE_A, ROLE_B])

    expect(labels.get(ROLE_A.id)).toBe('مدير النظام')
    expect(labels.get(ROLE_B.id)).toBe('مدير المستودع')
  })

  it('treats an unread catalogue as no labels rather than throwing', () => {
    expect(buildRoleLabelMap(undefined).size).toBe(0)
    expect(buildRoleLabelMap([]).size).toBe(0)
  })
})

describe('resolveRoleLabelAr', () => {
  it('prefers the catalogue label over the served role code', () => {
    const labels = buildRoleLabelMap([ROLE_A])

    // The directory row joins to `Role.Name`, never `Role.NameAr`, so the served
    // value is the code and must not win.
    expect(resolveRoleLabelAr(labels, ROLE_A.id, 'SYSTEM_ADMIN')).toBe('مدير النظام')
  })

  it('falls back to the served code when the catalogue is unreadable', () => {
    // A viewer without `admin.role.view` gets 403 on GET /admin/roles. The code
    // is still the authoritative answer; it is simply not translated.
    expect(resolveRoleLabelAr(buildRoleLabelMap(undefined), ROLE_A.id, 'SYSTEM_ADMIN')).toBe(
      'SYSTEM_ADMIN',
    )
  })

  it('returns null for a user with no assignment, in either representation', () => {
    const labels = buildRoleLabelMap([ROLE_A])

    expect(resolveRoleLabelAr(labels, null, null)).toBeNull()
    expect(resolveRoleLabelAr(labels, undefined, null)).toBeNull()
    // A role id with no served name and no catalogue entry has no label to show.
    expect(resolveRoleLabelAr(labels, ROLE_B.id, null)).toBeNull()
  })

  it('does not resolve through an unrelated role id', () => {
    const labels = buildRoleLabelMap([ROLE_A])

    expect(resolveRoleLabelAr(labels, ROLE_B.id, null)).toBeNull()
    expect(resolveRoleLabelAr(labels, ROLE_B.id, 'WH_MGR')).toBe('WH_MGR')
  })
})
