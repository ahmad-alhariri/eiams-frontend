import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from './server'

describe('MSW test server baseline', () => {
  it('intercepts a contract endpoint and returns the fixture', async () => {
    const fixture = {
      user: {
        userId: 'u-1',
        username: 'inspector',
        displayName: 'مفتش عام',
        status: 'Active',
        rowVersion: 1,
      },
      permissionCodes: ['document.view'],
      availableScopes: [{ scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة' }],
      scopeState: 'Selected',
      activeRoles: [{ roleId: 'r-1', code: 'AUDITOR', nameAr: 'مدقق' }],
    }

    server.use(http.get('/api/v1/auth/session', () => HttpResponse.json(fixture)))

    const response = await fetch('/api/v1/auth/session')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual(fixture)
    expect(body.scopeState).toBe('Selected')
    expect(body.activeRoles).toEqual([{ roleId: 'r-1', code: 'AUDITOR', nameAr: 'مدقق' }])
  })
})
