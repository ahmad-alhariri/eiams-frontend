import { createAxiosTransport } from '@/shared/api/axios-transport'
import { apiJson, okJson } from '@/test/msw/envelope'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authSessionQueryKey,
  createAuthSessionLifecycle,
  hasRememberedSession,
  rememberSession,
} from '@/modules/auth/services/session-lifecycle'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { createAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import type { AuthTokenResponse, SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionRole, createSessionScope, createSessionUser } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { stubLocalStorage } from '@/test/support/memory-storage'

const API_BASE_URL = '/api/v1'

const sessionFixture: SessionResponse = {
  user: createSessionUser({ firstName: 'أمين المستودع' }),
  role: createSessionRole(),
  activeScope: createSessionScope(),
  permissionCodes: ['document.create'],
}

const tokenResponse: AuthTokenResponse = {
  accessToken: 'in-memory-refresh-token',
  expiresInSeconds: 300,
  session: sessionFixture,
}

const bundles: ApiClientBundle[] = []

function setupLifecycle() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  const queryClient = createQueryClient()
  const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
  const lifecycle = createAuthSessionLifecycle({
    authService: createAuthService(createAxiosTransport(bundle.client)),
    queryClient,
    sessionAdapter: bundle.sessionAdapter,
    sessionStore,
  })

  return { bundle, lifecycle, queryClient, sessionStore }
}

beforeEach(() => {
  // The "signed in before" hint is a browser-context fact, so no case may start
  // with the previous case's.
  stubLocalStorage()
})

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('auth session lifecycle', () => {
  it('hydrates through the credentialed refresh endpoint and caches only the returned session projection', async () => {
    const { lifecycle, queryClient, sessionStore } = setupLifecycle()
    let refreshCredentials: RequestCredentials | null = null

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, ({ request }) => {
        refreshCredentials = request.credentials
        return okJson(tokenResponse)
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
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(tokenResponse)),
      http.post(`${API_BASE_URL}/auth/logout`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        // 200 with the real empty success envelope — the backend does not answer
        // 204 here, so a bare 204 fixture tested a wire shape that never ships.
        return okJson({})
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
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(tokenResponse)),
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(lifecycle.hydrate()).resolves.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(sessionStore.getState().status).toBe('unauthenticated')
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
  })

  it('evicts protected caches when a refresh fails during an ordinary protected request', async () => {
    const { bundle, lifecycle, queryClient, sessionStore } = setupLifecycle()

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(tokenResponse)),
      http.get(`${API_BASE_URL}/inventory/balances`, () => new HttpResponse(null, { status: 401 })),
    )

    await lifecycle.hydrate()
    queryClient.setQueryData(queryKeys.scoped({ kind: 'warehouse', id: 'wh-1' }, 'balances'), [10])
    queryClient.setQueryData(queryKeys.unscoped('catalog'), ['unscoped data'])
    queryClient.setQueryData(queryKeys.public('catalog'), ['material'])

    // The second refresh is the adapter's one allowed retry attempt and fails.
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        apiJson({ code: 'auth.session_expired' }, { status: 401 }),
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
    // unscoped (placeholder, never populated) is evicted with protected cache; public survives
    expect(queryClient.getQueryData(queryKeys.unscoped('catalog'))).toBeUndefined()
    expect(sessionStore.getState().status).toBe('unauthenticated')
  })

  it('remembers the browser was signed in after a restore and forgets it on logout', async () => {
    const { lifecycle } = setupLifecycle()

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(tokenResponse)),
      http.post(`${API_BASE_URL}/auth/logout`, () => okJson({})),
    )

    await lifecycle.hydrate()
    expect(hasRememberedSession()).toBe(true)

    await lifecycle.logout()
    expect(hasRememberedSession()).toBe(false)
  })

  it('treats an invalid refresh as "no session", resolving without noise', async () => {
    const { lifecycle, queryClient, sessionStore } = setupLifecycle()
    rememberSession()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        apiJson({ code: 'USERS_INVALID_REFRESH_TOKEN' }, { status: 400 }),
      ),
    )

    // A rejected bootstrap promise is what the browser logs and what an errored
    // query refetches on remount, so the failure has to RESOLVE as "no session".
    await expect(lifecycle.hydrate()).resolves.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(sessionStore.getState().status).toBe('unauthenticated')
    // Removed, not left in an error state: there is no query to refetch.
    expect(queryClient.getQueryState(authSessionQueryKey)).toBeUndefined()
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    // Dropping the hint is what makes the next page load skip the request
    // instead of repeating a 400 the browser logs as an error.
    expect(hasRememberedSession()).toBe(false)
  })
})
