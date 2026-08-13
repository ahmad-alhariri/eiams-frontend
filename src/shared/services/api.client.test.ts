import axios from 'axios'
import { delay, HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'

const sessionFixture: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.keeper',
    displayName: 'أمين المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['document.create'],
  availableScopes: [
    {
      scopeType: 'Warehouse',
      scopeId: '20000000-0000-4000-8000-000000000001',
      warehouseId: '20000000-0000-4000-8000-000000000001',
      siteId: '30000000-0000-4000-8000-000000000001',
      displayName: 'المستودع المركزي',
    },
  ],
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    warehouseId: '20000000-0000-4000-8000-000000000001',
    siteId: '30000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  },
  scopeState: 'Selected',
  activeRoles: [
    {
      roleId: '40000000-0000-4000-8000-000000000001',
      code: 'WH_KEEPER',
      nameAr: 'أمين مستودع',
    },
  ],
}

function tokenResponse(accessToken: string): AuthTokenResponse {
  return {
    accessToken,
    expiresInSeconds: 300,
    session: sessionFixture,
    tokenType: 'Bearer',
  }
}

const bundles: ApiClientBundle[] = []

function setupClient(): ApiClientBundle {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return bundle
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('shared API client', () => {
  it('uses the configured base URL, credentials, and adapter-owned bearer header', async () => {
    const { client, sessionAdapter } = setupClient()
    const observed: Array<{
      authorization: string | null
      credentials: RequestCredentials
    }> = []

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        observed.push({
          authorization: request.headers.get('Authorization'),
          credentials: request.credentials,
        })
        return HttpResponse.json({ ok: true })
      }),
    )

    expect(client.defaults.baseURL).toBe(API_BASE_URL)
    expect(client.defaults.withCredentials).toBe(true)

    await client.get('/inventory/balances', {
      headers: { Authorization: 'Bearer caller-owned-token' },
      withCredentials: false,
    })

    sessionAdapter.installTokenResponse(tokenResponse('memory-only-token'))
    await client.get('/inventory/balances')

    expect(observed).toEqual([
      { authorization: null, credentials: 'include' },
      { authorization: 'Bearer memory-only-token', credentials: 'include' },
    ])
  })

  it('shares one refresh across concurrent 401 responses and retries each request once', async () => {
    const { client, sessionAdapter } = setupClient()
    const events: string[] = []
    let refreshCalls = 0
    let protectedCalls = 0

    sessionAdapter.installTokenResponse(tokenResponse('expired-token'))
    sessionAdapter.subscribe(() => {
      throw new Error('Observer failures are isolated from transport')
    })
    sessionAdapter.subscribe((event) => events.push(event.type))

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        protectedCalls += 1
        return request.headers.get('Authorization') === 'Bearer refreshed-token'
          ? HttpResponse.json({ request: 'balances' })
          : new HttpResponse(null, { status: 401 })
      }),
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        protectedCalls += 1
        return request.headers.get('Authorization') === 'Bearer refreshed-token'
          ? HttpResponse.json({ request: 'warehouses' })
          : new HttpResponse(null, { status: 401 })
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, async ({ request }) => {
        refreshCalls += 1
        expect(request.headers.get('Authorization')).toBeNull()
        expect(request.credentials).toBe('include')
        await delay(20)
        return HttpResponse.json(tokenResponse('refreshed-token'))
      }),
    )

    const [balances, warehouses] = await Promise.all([
      client.get('/inventory/balances'),
      client.get('/warehouses'),
    ])

    expect(balances.data).toEqual({ request: 'balances' })
    expect(warehouses.data).toEqual({ request: 'warehouses' })
    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toBe(4)
    expect(events).toEqual(['session-refreshed'])
  })

  it('terminates after one retry and preserves the final Axios response error', async () => {
    const { client, sessionAdapter } = setupClient()
    let protectedCalls = 0
    let refreshCalls = 0

    sessionAdapter.installTokenResponse(tokenResponse('expired-token'))
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        protectedCalls += 1
        return HttpResponse.json({ code: 'auth.unauthorized' }, { status: 401 })
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCalls += 1
        return HttpResponse.json(tokenResponse('still-rejected-token'))
      }),
    )

    const error = await client.get('/inventory/balances').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    if (!axios.isAxiosError(error)) {
      throw new Error('Expected Axios to preserve its response error')
    }
    expect(error.response?.status).toBe(401)
    expect(error.config?.url).toBe('/inventory/balances')
    expect(protectedCalls).toBe(2)
    expect(refreshCalls).toBe(1)
  })

  it('clears the token, expires once, and preserves the refresh Axios error on failure', async () => {
    const { client, sessionAdapter } = setupClient()
    const events: string[] = []
    const observedAuthorization: Array<string | null> = []
    let refreshCalls = 0

    sessionAdapter.installTokenResponse(tokenResponse('expired-token'))
    sessionAdapter.subscribe((event) => events.push(event.type))
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCalls += 1
        return HttpResponse.json({ code: 'auth.session_expired' }, { status: 401 })
      }),
      http.get(`${API_BASE_URL}/reports/dashboard`, ({ request }) => {
        observedAuthorization.push(request.headers.get('Authorization'))
        return HttpResponse.json({ ok: true })
      }),
    )

    const error = await client.get('/inventory/balances').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    if (!axios.isAxiosError(error)) {
      throw new Error('Expected the refresh Axios error to be preserved')
    }
    expect(error.response?.status).toBe(401)
    expect(error.config?.url).toBe('/auth/refresh')
    expect(refreshCalls).toBe(1)
    expect(events).toEqual(['session-expired'])

    await client.get('/reports/dashboard')
    expect(observedAuthorization).toEqual([null])
  })

  it('does not refresh login or refresh failures', async () => {
    const { client } = setupClient()
    let refreshCalls = 0

    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () => {
        return HttpResponse.json({ code: 'auth.invalid_credentials' }, { status: 401 })
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCalls += 1
        return HttpResponse.json({ code: 'auth.session_expired' }, { status: 401 })
      }),
    )

    await expect(client.post('/auth/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    })
    await expect(client.post('/auth/refresh')).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(refreshCalls).toBe(1)
  })

  it('preserves the authenticated session on 403 without attempting refresh', async () => {
    const { client, sessionAdapter } = setupClient()
    const events = vi.fn()
    let refreshCalls = 0
    const observedAuthorization: Array<string | null> = []

    sessionAdapter.installTokenResponse(tokenResponse('valid-token'))
    sessionAdapter.subscribe(events)
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        observedAuthorization.push(request.headers.get('Authorization'))
        return HttpResponse.json({ code: 'auth.permission_denied' }, { status: 403 })
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCalls += 1
        return HttpResponse.json(tokenResponse('unexpected-token'))
      }),
    )

    await expect(client.get('/inventory/balances')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(refreshCalls).toBe(0)
    expect(observedAuthorization).toEqual(['Bearer valid-token'])
    expect(events).not.toHaveBeenCalled()
  })

  it('never persists installed credentials in browser storage', () => {
    const { sessionAdapter } = setupClient()
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem')

    sessionAdapter.installTokenResponse(tokenResponse('memory-only-token'))

    expect(localStorageSpy).not.toHaveBeenCalled()
    localStorageSpy.mockRestore()
  })
})
