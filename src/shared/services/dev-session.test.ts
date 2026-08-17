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

  it('enables bypass only in the development mode by default', () => {
    expect(isDevAuthBypassEnabled({ mode: 'development' }, {})).toBe(true)
    expect(isDevAuthBypassEnabled({ mode: 'test' }, {})).toBe(false)
    expect(isDevAuthBypassEnabled({ mode: 'production' }, {})).toBe(false)
  })

  it('honors an explicit VITE_AUTH_BYPASS=false off-switch', () => {
    expect(isDevAuthBypassEnabled({ mode: 'development' }, { VITE_AUTH_BYPASS: 'false' })).toBe(
      false,
    )
    expect(isDevAuthBypassEnabled({ mode: 'development' }, { VITE_AUTH_BYPASS: 'true' })).toBe(true)
  })
})
