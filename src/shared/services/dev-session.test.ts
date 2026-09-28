import { describe, expect, it } from 'vitest'

import { PERMISSION_CODES } from '@/config/permissions'
import { createDevSession, isDevAuthBypassEnabled } from '@/shared/services/dev-session'

describe('Dev session fixture (auth bypass)', () => {
  it('serves a selected Enterprise scope with the full permission vocabulary', () => {
    const response = createDevSession()

    expect(response.session.scopeState).toBe('Selected')
    expect(response.session.activeScope?.scopeType).toBe('Enterprise')
    expect(response.session.permissionCodes).toEqual([...PERMISSION_CODES])
    expect(response.session.availableScopes).toHaveLength(1)
    expect(response.accessToken.length).toBeGreaterThan(0)
  })

  it('names the fixture user in Arabic', () => {
    const session = createDevSession().session
    expect(session.user.displayName).toBe('مطور النظام')
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
