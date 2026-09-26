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
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

/**
 * D-SRS-01 singular-session fixtures.
 *
 * The frozen provisional contract still declares `availableScopes` and
 * `scopeState` as required fields on `SessionResponse`. The D-SRS-01
 * singular-session refactor removed their consumer code in the frontend,
 * but the type is still imported from the deprecated generated artifact.
 * These fixtures satisfy the type until `whhu.5` deletes the generated
 * artifact entirely.
 */
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
  // The generated contract types `activeScope` as optional with
  // exactOptionalPropertyTypes: true. Omit it entirely to model the
  // server-detected Unavailable case; the route-guards `hasActiveScope`
  // predicate treats the absent property as a missing scope.
  permissionCodes: [],
}
delete (sessionWithoutScope as { activeScope?: unknown }).activeScope

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
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument()
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
