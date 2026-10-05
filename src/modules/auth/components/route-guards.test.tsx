import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import {
  AnonymousRoute,
  RequireActiveScope,
  RouteAccessGuard,
} from '@/modules/auth/components/route-guards'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { AuthSessionStatus } from '@/modules/auth/store/auth-session.store'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole } from '@/test/msw/factories'

const activeScopeSession: SessionResponse = {
  user: createSessionUser({ firstName: 'أمين المستودع' }),
  role: createSessionRole(),
  permissionCodes: ['inventory.view'],
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    scopeName: 'المستودع المركزي',
  },
}

/**
 * Deliberately builds a session carrying NO activeScope.
 *
 * `SessionResponse.activeScope` is required, so this payload cannot be expressed through the
 * type — which is the point. It is the shape the guard must still refuse: the guard this bead
 * closed compared `scopeState === 'SelectionRequired'` by equality, so undefined fell through
 * to rendering the protected tree. The cast is the assertion under test, not a convenience,
 * so it is confined to this one function.
 */
function sessionWithoutScope(): SessionResponse {
  return { ...activeScopeSession, activeScope: undefined } as unknown as SessionResponse
}

function renderRoutes({
  initialPath = '/protected',
  session,
  status,
}: {
  initialPath?: string
  session?: SessionResponse
  status: AuthSessionStatus
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (session) {
    queryClient.setQueryData(authSessionQueryKey, session)
  }
  useAuthSessionStore.setState({ status })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/login"
            element={
              <AnonymousRoute>
                <p>صفحة الدخول</p>
              </AnonymousRoute>
            }
          />
          <Route
            path="/protected"
            element={
              <RequireActiveScope>
                <p>محتوى محمي</p>
              </RequireActiveScope>
            }
          />
          <Route
            path="/inventory"
            element={
              <RouteAccessGuard route="inventoryBalances">
                <p>أرصدة المخزون</p>
              </RouteAccessGuard>
            }
          />
          <Route path="/" element={<p>لوحة المعلومات</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  act(() => {
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

describe('authentication route guards', () => {
  it('holds protected content behind a neutral Arabic loading boundary during hydration', () => {
    renderRoutes({ status: 'initializing' })

    expect(screen.getByRole('main', { name: 'التحقق من الجلسة' })).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated protected request to the anonymous login route', () => {
    renderRoutes({ status: 'unauthenticated' })

    expect(screen.getByText('صفحة الدخول')).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('denies an authenticated session that carries no active scope', () => {
    renderRoutes({ status: 'authenticated', session: sessionWithoutScope() })

    expect(screen.getByRole('heading', { name: 'لا يتوفر نطاق عمل' })).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('renders scoped content and keeps permission denial separate from logout', () => {
    renderRoutes({
      initialPath: '/inventory',
      status: 'authenticated',
      session: { ...activeScopeSession, permissionCodes: [] },
    })

    expect(screen.getByRole('heading', { name: 'ليست لديك صلاحية الوصول' })).toBeInTheDocument()
    expect(useAuthSessionStore.getState().status).toBe('authenticated')
  })

  it('allows a scoped route when the canonical route permission passes', () => {
    renderRoutes({
      initialPath: '/inventory',
      status: 'authenticated',
      session: activeScopeSession,
    })

    expect(screen.getByText('أرصدة المخزون')).toBeInTheDocument()
  })

  it('holds the anonymous login route at the neutral boundary until hydration ends', () => {
    renderRoutes({ initialPath: '/login', status: 'initializing' })

    expect(screen.getByRole('main', { name: 'التحقق من الجلسة' })).toBeInTheDocument()
    expect(screen.queryByText('صفحة الدخول')).not.toBeInTheDocument()
  })
})
