import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import {
  authSessionQueryKey,
  createAuthSessionLifecycle,
} from '@/modules/auth/services/session-lifecycle'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { createAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
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
  availableScopes: [],
  scopeState: 'SelectionRequired',
  activeRoles: [],
}

const tokenResponse: AuthTokenResponse = {
  accessToken: 'in-memory-refresh-token',
  expiresInSeconds: 300,
  tokenType: 'Bearer',
  session: sessionFixture,
}

const bundles: ApiClientBundle[] = []

function setupLifecycle() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  const queryClient = createQueryClient()
  const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
  const lifecycle = createAuthSessionLifecycle({
    authService: createAuthService(bundle.client),
    queryClient,
    sessionAdapter: bundle.sessionAdapter,
    sessionStore,
  })

  return { bundle, lifecycle, queryClient, sessionStore }
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('auth session lifecycle', () => {
  it('hydrates through the credentialed refresh endpoint and caches only the returned session projection', async () => {
    const { lifecycle, queryClient, sessionStore } = setupLifecycle()
    let refreshCredentials: RequestCredentials | null = null

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, ({ request }) => {
        refreshCredentials = request.credentials
        return HttpResponse.json(tokenResponse)
      }),
    )

    await expect(lifecycle.hydrate()).resolves.toEqual(sessionFixture)
    expect(refreshCredentials).toBe('include')
    expect(queryClient.getQueryData(authSessionQueryKey)).toEqual(sessionFixture)
    expect(sessionStore.getState().status).toBe('authenticated')
    expect(sessionStore.getState()).not.toHaveProperty('session')
  })

  it('clears the adapter, session cache, and protected scoped cache after idempotent logout while retaining public data', async () => {
    const { lifecycle, queryClient, sessionStore } = setupLifecycle()
    let authorization: string | null = null

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.json(tokenResponse)),
      http.post(`${API_BASE_URL}/auth/logout`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await lifecycle.hydrate()
    queryClient.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'), [10])
    queryClient.setQueryData(queryKeys.public('catalog'), ['material'])

    await expect(lifecycle.logout()).resolves.toBeUndefined()
    expect(authorization).toBe('Bearer in-memory-refresh-token')
    expect(sessionStore.getState().status).toBe('unauthenticated')
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances')),
    ).toBeUndefined()
    expect(queryClient.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
  })

  it('ends the local session and removes protected cache when refresh or logout cannot reach the server', async () => {
    const { lifecycle, queryClient, sessionStore } = setupLifecycle()

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.json(tokenResponse)),
      http.post(`${API_BASE_URL}/auth/logout`, () => HttpResponse.error()),
    )

    await lifecycle.hydrate()
    queryClient.setQueryData(queryKeys.scoped({ kind: 'site', id: 'site-1' }, 'documents'), [
      'draft',
    ])

    await expect(lifecycle.logout()).rejects.toBeTruthy()
    expect(sessionStore.getState().status).toBe('unauthenticated')
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData(queryKeys.scoped({ kind: 'site', id: 'site-1' }, 'documents')),
    ).toBeUndefined()

    server.use(http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.error()))
    await expect(lifecycle.hydrate()).rejects.toBeTruthy()
    expect(sessionStore.getState().status).toBe('unauthenticated')
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
  })

  it('evicts protected caches when a refresh fails during an ordinary protected request', async () => {
    const { bundle, lifecycle, queryClient, sessionStore } = setupLifecycle()

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.json(tokenResponse)),
      http.get(`${API_BASE_URL}/inventory/balances`, () => new HttpResponse(null, { status: 401 })),
    )

    await lifecycle.hydrate()
    queryClient.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'), [10])
    queryClient.setQueryData(queryKeys.public('catalog'), ['material'])

    // The second refresh is the adapter's one allowed retry attempt and fails.
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({ code: 'auth.session_expired' }, { status: 401 }),
      ),
    )

    await expect(bundle.client.get('/inventory/balances')).rejects.toMatchObject({
      response: { status: 401 },
    })

    await expect.poll(() => queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    await expect
      .poll(() =>
        queryClient.getQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances')),
      )
      .toBeUndefined()
    expect(queryClient.getQueryData(queryKeys.public('catalog'))).toEqual(['material'])
    expect(sessionStore.getState().status).toBe('unauthenticated')
  })
})
