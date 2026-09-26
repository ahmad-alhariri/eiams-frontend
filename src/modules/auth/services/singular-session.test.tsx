import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActiveScopeBadge } from '@/modules/auth/components/active-scope-badge'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  authSessionQueryKey,
  createAuthSessionLifecycle,
} from '@/modules/auth/services/session-lifecycle'
import { createAuthService } from '@/modules/auth/services/auth.service'
import { createAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { SessionResponse } from '@/modules/auth/types/auth.api-types'
import { createApiClient } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import { createDevSession } from '@/shared/services/dev-session'
import { createAuthTokenResponse, createSession } from '@/test/msw/factories'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: vi.fn(),
}))

const mockedUseActiveScopeContext = vi.mocked(useActiveScopeContext)

/**
 * D-SRS-01 / D-INT-01 singular-session verification (bead eiams-frontend-7ipk.4).
 *
 * The session carries exactly one required `activeScope` with `scopeState`
 * of `Selected` | `Unavailable` only. There is no `availableScopes`
 * collection, no `SelectionRequired` state, and no ordinary-UI scope
 * switcher (`PUT /auth/active-scope` is an authorized admin override only).
 */
describe('singular session contract (D-SRS-01)', () => {
  it('exposes exactly the singular SessionResponse keys', () => {
    const session = createSession()

    expect(Object.keys(session).sort()).toEqual(
      ['activeRoles', 'activeScope', 'permissionCodes', 'scopeState', 'user'].sort(),
    )
    expect(session).not.toHaveProperty('availableScopes')
    expect(JSON.stringify(session)).not.toContain('availableScopes')
    expect(JSON.stringify(session)).not.toContain('SelectionRequired')
  })

  it('serves the dev session selected with a required activeScope', () => {
    const response = createDevSession()

    expect(response.session.scopeState).toBe('Selected')
    expect(response.session.activeScope.scopeType).toBe('Enterprise')
    expect(response.session).not.toHaveProperty('availableScopes')
  })

  it('installs a login with a selected activeScope straight into the session cache', () => {
    const bundle = createApiClient({ baseURL: 'http://localhost/api/v1' })
    try {
      const queryClient = createQueryClient()
      const sessionStore = createAuthSessionStore(bundle.sessionAdapter)
      const lifecycle = createAuthSessionLifecycle({
        authService: createAuthService(bundle.client),
        queryClient,
        sessionAdapter: bundle.sessionAdapter,
        sessionStore,
      })

      const login = createAuthTokenResponse()
      lifecycle.installLogin(login)

      const cached = queryClient.getQueryData<SessionResponse>(authSessionQueryKey)
      expect(sessionStore.getState().status).toBe('authenticated')
      expect(cached?.scopeState).toBe('Selected')
      expect(cached?.activeScope.displayName).toBe(login.session.activeScope.displayName)
      expect(cached).not.toHaveProperty('availableScopes')
    } finally {
      bundle.dispose()
    }
  })

  it('renders the ordinary-UI scope context as static text with no picker', () => {
    const session = createSession()
    mockedUseActiveScopeContext.mockReturnValue({
      activeScope: session.activeScope,
      activeScopeCacheKey: { kind: 'warehouse', id: session.activeScope.scopeId ?? '' },
    })

    const queryClient = createQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ActiveScopeBadge />
      </QueryClientProvider>,
    )

    expect(screen.getByText(session.activeScope.displayName)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.querySelector('select')).toBeNull()

    vi.clearAllMocks()
  })

  it('keeps an Unavailable assignment blocked while still identifying its scope', () => {
    const unavailable: SessionResponse = {
      ...createSession(),
      scopeState: 'Unavailable',
      permissionCodes: [],
    }

    expect(unavailable.scopeState).toBe('Unavailable')
    expect(unavailable.activeScope.displayName).toBeTruthy()
    expect(unavailable.permissionCodes).toHaveLength(0)
  })
})
