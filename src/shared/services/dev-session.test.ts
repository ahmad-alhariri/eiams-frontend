import { describe, expect, it } from 'vitest'

import { PERMISSION_CODES } from '@/config/permissions'
import {
  toSessionScopeLabel,
  toSessionUserDisplayName,
} from '@/modules/auth/services/session-display'
import { createDevSession, isDevAuthBypassEnabled } from '@/shared/services/dev-session'

describe('Dev session fixture (auth bypass)', () => {
  it('serves a server-assigned Enterprise scope with the full permission vocabulary', () => {
    const response = createDevSession()

    expect(response.session.activeScope?.scopeType).toBe('Enterprise')
    expect(response.session.permissionCodes).toEqual([...PERMISSION_CODES])
    expect(response.accessToken.length).toBeGreaterThan(0)
  })

  it('names the fixture user and role in Arabic', () => {
    const session = createDevSession().session

    // The session projection carries first/last name and a single role's `nameAr`.
    // It has no `displayName`; reading one previously type-checked against the stale
    // generated type while being `undefined` on the wire.
    expect(toSessionUserDisplayName(session.user)).toBe('مطور النظام')
    expect(session.role.nameAr.length).toBeGreaterThan(0)
  })

  it('carries a scope name rather than the old displayName field', () => {
    const session = createDevSession().session

    expect(toSessionScopeLabel(session.activeScope)).toBe('نطاق التطوير')
    expect('displayName' in session.activeScope).toBe(false)
  })

  it('is opt-in: an unset profile never enables the bypass', () => {
    // RESOLUTION-040: the fixture used to default ON, which let a
    // fixture-authenticated UI be read as proof that real login, refresh,
    // authorization and session hydration work.
    expect(isDevAuthBypassEnabled({ mode: 'development', authBypass: false })).toBe(false)
  })

  it('enables the bypass only in development and only when explicitly requested', () => {
    expect(isDevAuthBypassEnabled({ mode: 'development', authBypass: true })).toBe(true)
    expect(isDevAuthBypassEnabled({ mode: 'test', authBypass: true })).toBe(false)
    expect(isDevAuthBypassEnabled({ mode: 'production', authBypass: true })).toBe(false)
  })
})
