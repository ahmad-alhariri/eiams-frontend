import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import { RouteAccessGuard } from '@/modules/auth/components/route-guards'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { createQueryClient } from '@/shared/services/query.client'
import type { DocumentPolicy } from '@/shared/types/generated/eiams-v1'
import type { SessionResponse } from '@/modules/auth/types/auth.api-types'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001'
const SITE_ID = '30000000-0000-4000-8000-000000000001'

const warehouseScope = {
  scopeType: 'Warehouse' as const,
  scopeId: WAREHOUSE_ID,
  displayName: 'مستودع دمشق المركزي',
  siteId: SITE_ID,
  warehouseId: WAREHOUSE_ID,
}

/** D-SRS-01 singular-session fixture (handwritten contract). */
function selectedSession(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.keeper',
      displayName: 'أمين المستودع',
    },
    permissionCodes,
    activeScope: warehouseScope,
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const postPolicy: DocumentPolicy = {
  documentId: 'document-1',
  documentStatus: 'Submitted',
  evaluatedAt: '2026-08-11T08:00:00Z',
  policyKind: 'Generic',
  rowVersion: 1,
  signedOriginalSatisfied: true,
  actions: [
    {
      action: 'Post',
      allowed: true,
      confirmationRequired: false,
      presentation: 'Enabled',
      reasonAr: null,
      reasonCode: null,
      reasonRequired: false,
    },
  ],
  advisories: [],
  blockers: [],
}

/**
 * A real consumer composition: the policy may offer Post, but the action is
 * still pre-filtered by the effective session permission. It does not infer a
 * role or reimplement the server policy.
 */
function InventoryWithDocumentAction({ onExecute }: { onExecute: () => void }) {
  const { has } = usePermission()

  return (
    <section aria-label="محتوى أرصدة المخزون">
      <p>أرصدة المخزون</p>
      <LifecycleActionBar
        policy={postPolicy}
        busyAction={null}
        disabled={!has('warehouse-documents:post')}
        onExecute={onExecute}
      />
    </section>
  )
}

const bundles: ApiClientBundle[] = []

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
  act(() => {
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

describe('RBAC route and action separation', () => {
  it('keeps an allowed route visible while disabling a policy-enabled action without its separate permission', async () => {
    const queryClient = createQueryClient()
    const onExecute = vi.fn()
    queryClient.setQueryData(authSessionQueryKey, selectedSession(['inventory:view']))
    useAuthSessionStore.setState({ status: 'authenticated' })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/inventory']}>
          <Routes>
            <Route
              path="/inventory"
              element={
                <RouteAccessGuard route="inventoryBalances">
                  <InventoryWithDocumentAction onExecute={onExecute} />
                </RouteAccessGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('region', { name: 'محتوى أرصدة المخزون' })).toBeInTheDocument()
    const post = screen.getByRole('button', { name: 'ترحيل' })
    expect(post).toBeDisabled()

    await userEvent.setup().click(post)
    expect(onExecute).not.toHaveBeenCalled()
  })

  /**
   * Under D-SRS-01 the user cannot switch scopes from the client; the only
   * legitimate permission change is the server-returned session after an
   * admin updates the user's role-scope assignment. This test verifies the
   * route re-evaluates from the new server-returned session.
   *
   * `usePermission` reads the cached session through an observer whose
   * queryFn is intentionally disabled (`enabled: false`); the application
   * hydration flow owns session writes via `setQueryData`, not via fetch.
   * The test mirrors that path: the admin updates the user's role-scope
   * server-side, the client receives the new session (e.g. via a future
   * SSE/polling channel that writes to the cache), and the UI re-evaluates.
   */
  it('re-evaluates the route from the server-returned session after a server-side permission change', async () => {
    const bundle = createApiClient({ baseURL: API_BASE_URL })
    bundles.push(bundle)
    const queryClient = createQueryClient()
    const onExecute = vi.fn()
    const nextSession = selectedSession(['warehouse-documents:post', 'inventory:view'])

    queryClient.setQueryData(authSessionQueryKey, selectedSession(['inventory:view']))
    useAuthSessionStore.setState({ status: 'authenticated' })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/inventory']}>
          <Routes>
            <Route
              path="/inventory"
              element={
                <RouteAccessGuard route="inventoryBalances">
                  <InventoryWithDocumentAction onExecute={onExecute} />
                </RouteAccessGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('أرصدة المخزون')).toBeInTheDocument()

    await act(async () => {
      // Admin updated the user's role-scope server-side; the application
      // hydration flow (or a future real-time channel) writes the new
      // session into the cache.
      queryClient.setQueryData(authSessionQueryKey, nextSession)
    })

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'محتوى أرصدة المخزون' })).toBeInTheDocument()
    })
    const post = screen.getByRole('button', { name: 'ترحيل' })
    expect(post).not.toBeDisabled()
    expect(useAuthSessionStore.getState().status).toBe('authenticated')
  })
})
