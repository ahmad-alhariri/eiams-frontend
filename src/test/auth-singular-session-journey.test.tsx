import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createApiClient } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import { createAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { createAuthSessionLifecycle } from '@/modules/auth/services/session-lifecycle'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createSession } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ActiveScopeBadge } from '@/modules/auth/components/active-scope-badge'

const ABSOLUTE_API_BASE_URL = 'http://localhost/api/v1'

describe('singular session journey (D-SRS-01)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the active scope badge from the hydrated singular session without a switcher', async () => {
    const session = createSession({
      activeScope: {
        scopeType: 'Site',
        scopeId: '00000000-0000-4000-8000-000000000071',
        displayName: 'موقع دمشق',
        siteId: '00000000-0000-4000-8000-000000000071',
      },
      permissionCodes: ['users:view', 'users:manage'],
    })

    server.use(
      http.post(`${ABSOLUTE_API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: 'refreshed-access-token',
          expiresInSeconds: 900,
          tokenType: 'Bearer',
          session: {
            ...session,
            user: {
              userId: '10000000-0000-4000-8000-000000000001',
              username: 'dev',
              displayName: 'مطور النظام',
            },
          },
        }),
      ),
      http.get(`${ABSOLUTE_API_BASE_URL}/auth/session`, () => HttpResponse.json(session)),
    )

    const bundle = createApiClient({
      baseURL: ABSOLUTE_API_BASE_URL,
      refreshSession: async () =>
        ({
          accessToken: 'refreshed-access-token',
          expiresInSeconds: 900,
          tokenType: 'Bearer',
          session: {
            ...session,
            user: {
              userId: '10000000-0000-4000-8000-000000000001',
              username: 'dev',
              displayName: 'مطور النظام',
            },
          },
        }) as never,
    })
    const queryClient = createQueryClient()
    const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
    const lifecycle = createAuthSessionLifecycle({
      authService: createAuthService(bundle.client),
      queryClient,
      sessionAdapter: bundle.sessionAdapter,
      sessionStore,
    })

    await lifecycle.hydrate()
    expect(sessionStore.getState().status).toBe('authenticated')

    const cached = queryClient.getQueryData<typeof session>(authSessionQueryKey)
    expect(cached).toEqual(session)
    expect(cached).not.toHaveProperty('availableScopes')
    expect(JSON.stringify(cached)).not.toContain('SelectionRequired')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<ActiveScopeBadge />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('موقع دمشق')).toBeInTheDocument())
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    bundle.dispose()
  })

  it('keeps an unavailable assignment blocked without exposing a scope picker', async () => {
    const session = createSession({
      scopeState: 'Unavailable',
      permissionCodes: [],
    })

    server.use(
      http.post(`${ABSOLUTE_API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: 'refreshed-access-token',
          expiresInSeconds: 900,
          tokenType: 'Bearer',
          session: {
            ...session,
            user: {
              userId: '10000000-0000-4000-8000-000000000001',
              username: 'dev',
              displayName: 'مطور النظام',
            },
          },
        }),
      ),
      http.get(`${ABSOLUTE_API_BASE_URL}/auth/session`, () => HttpResponse.json(session)),
    )

    const bundle = createApiClient({
      baseURL: ABSOLUTE_API_BASE_URL,
      refreshSession: async () =>
        ({
          accessToken: 'refreshed-access-token',
          expiresInSeconds: 900,
          tokenType: 'Bearer',
          session: {
            ...session,
            user: {
              userId: '10000000-0000-4000-8000-000000000001',
              username: 'dev',
              displayName: 'مطور النظام',
            },
          },
        }) as never,
    })
    const queryClient = createQueryClient()
    const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
    const lifecycle = createAuthSessionLifecycle({
      authService: createAuthService(bundle.client),
      queryClient,
      sessionAdapter: bundle.sessionAdapter,
      sessionStore,
    })

    await lifecycle.hydrate()
    const cached = queryClient.getQueryData<typeof session>(authSessionQueryKey)
    expect(cached?.scopeState).toBe('Unavailable')
    expect(cached?.permissionCodes).toHaveLength(0)
    expect(cached).not.toHaveProperty('availableScopes')

    bundle.dispose()
  })

  it('installs a login with a selected activeScope straight into the session cache', async () => {
    const session = createSession({
      activeScope: {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
      permissionCodes: ['admin.user.manage'],
    })
    const tokenResponse = {
      accessToken: 'login-access-token',
      expiresInSeconds: 900,
      session,
      tokenType: 'Bearer',
    }

    const bundle = createApiClient({ baseURL: ABSOLUTE_API_BASE_URL })
    const queryClient = createQueryClient()
    const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
    const lifecycle = createAuthSessionLifecycle({
      authService: createAuthService(bundle.client),
      queryClient,
      sessionAdapter: bundle.sessionAdapter,
      sessionStore,
    })

    lifecycle.installLogin(tokenResponse)
    const cached = queryClient.getQueryData<typeof session>(authSessionQueryKey)
    expect(sessionStore.getState().status).toBe('authenticated')
    expect(cached?.scopeState).toBe('Selected')
    expect(cached?.activeScope.displayName).toBe('الهيئة العامة للرقابة والتفتيش')
    expect(cached).not.toHaveProperty('availableScopes')
    expect(JSON.stringify(cached)).not.toContain('SelectionRequired')

    bundle.dispose()
  })
})
