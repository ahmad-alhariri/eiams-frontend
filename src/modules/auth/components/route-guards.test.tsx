import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import {
  AnonymousRoute,
  NoAccessRoute,
  RequireSelectedScope,
  RouteAccessGuard,
} from '@/modules/auth/components/route-guards'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { AuthSessionStatus } from '@/modules/auth/store/auth-session.store'
import type { SessionResponse } from '@/modules/auth/types/auth.api-types'

/**
 * D-SRS-01 singular-session fixtures (handwritten contract: required
 * `activeScope`, `scopeState` of `Selected` | `Unavailable` only — no
 * `availableScopes`, no `SelectionRequired`).
 */
const selectedSession: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.manager',
    displayName: 'أمين المستودع',
  },
  permissionCodes: ['inventory:view'],
  scopeState: 'Selected',
  activeScope: {
    scopeType: 'Warehouse',
    scopeId: '20000000-0000-4000-8000-000000000001',
    warehouseId: '20000000-0000-4000-8000-000000000001',
    siteId: '30000000-0000-4000-8000-000000000001',
    displayName: 'المستودع المركزي',
  },
  activeRoles: [],
}

const sessionWithoutScope: SessionResponse = {
  ...selectedSession,
  // Server-detected invalid assignment: the required `activeScope` still
  // identifies the sole assigned context, but `scopeState` is Unavailable
  // and the server returns no usable permissions. The guards render the
  // contact-administrator no-access screen for this state.
  scopeState: 'Unavailable',
  permissionCodes: [],
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

describe('authentication route guards (D-SRS-01 singular session)', () => {
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

  it('renders the contact-administrator state for an authenticated session without a scope', () => {
    renderRoutes({ status: 'authenticated', session: sessionWithoutScope })

    expect(screen.getByRole('heading', { name: 'لا يتوفر نطاق عمل' })).toBeInTheDocument()
    expect(screen.getByText(/تواصل مع مسؤول النظام/u)).toBeInTheDocument()
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
  })

  it('renders protected content directly for a Selected session with no selection gate', () => {
    renderRoutes({ status: 'authenticated', session: selectedSession })

    expect(screen.getByText('محتوى محمي')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'لا يتوفر نطاق عمل' })).not.toBeInTheDocument()
  })

  it('renders permission denial and keeps the session authenticated', () => {
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
