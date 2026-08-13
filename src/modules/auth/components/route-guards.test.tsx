import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import {
  AnonymousRoute,
  NoAccessRoute,
  RequireSelectedScope,
  RouteAccessGuard,
  ScopeSelectionRoute,
} from '@/modules/auth/components/route-guards'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { AuthSessionStatus } from '@/modules/auth/store/auth-session.store'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const selectedSession: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.manager',
    displayName: 'أمين المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['inventory.view'],
  availableScopes: [],
  scopeState: 'Selected',
  activeRoles: [],
}

function withScopeState(scopeState: SessionResponse['scopeState']): SessionResponse {
  return { ...selectedSession, scopeState }
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
          <Route path="/session/scope" element={<ScopeSelectionRoute />} />
          <Route path="/session/no-access" element={<NoAccessRoute />} />
          <Route
            path="/protected"
            element={
              <RequireSelectedScope>
                <p>محتوى محمي</p>
              </RequireSelectedScope>
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

  it('redirects authenticated users without a selected scope to the scope gate', () => {
    renderRoutes({ status: 'authenticated', session: withScopeState('SelectionRequired') })

    expect(screen.getByRole('heading', { name: 'اختيار نطاق العمل مطلوب' })).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('redirects authenticated users with no effective scope to the contact-administrator state', () => {
    renderRoutes({ status: 'authenticated', session: withScopeState('Unavailable') })

    expect(screen.getByRole('heading', { name: 'لا يتوفر نطاق عمل' })).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('renders selected-scope content and keeps permission denial separate from logout', () => {
    renderRoutes({
      initialPath: '/inventory',
      status: 'authenticated',
      session: { ...selectedSession, permissionCodes: [] },
    })

    expect(screen.getByRole('heading', { name: 'ليست لديك صلاحية الوصول' })).toBeInTheDocument()
    expect(useAuthSessionStore.getState().status).toBe('authenticated')
  })

  it('allows a selected-scope route when the canonical route permission passes', () => {
    renderRoutes({ initialPath: '/inventory', status: 'authenticated', session: selectedSession })

    expect(screen.getByText('أرصدة المخزون')).toBeInTheDocument()
  })

  it('holds the anonymous login route at the neutral boundary until hydration ends', () => {
    renderRoutes({ initialPath: '/login', status: 'initializing' })

    expect(screen.getByRole('main', { name: 'التحقق من الجلسة' })).toBeInTheDocument()
    expect(screen.queryByText('صفحة الدخول')).not.toBeInTheDocument()
  })
})
