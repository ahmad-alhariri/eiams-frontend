import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ActiveCountWarning } from './active-count-warning'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '553e4567-e89b-42d3-a456-426614174005'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'count.manager',
      displayName: 'مدير الجرد',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      { scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة العامة للرقابة والتفتيش' },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

describe('ActiveCountWarning (e20-t09)', () => {
  it('shows the warning when an InProgress count exists for the warehouse', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts`, () =>
        HttpResponse.json({
          items: [
            {
              countId: 'active-1',
              referenceNumber: 'EIAMS-CNT-2026-0109',
              documentStatus: 'InProgress',
              status: 'InProgress',
            },
          ],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 1, totalPages: 1 },
        }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.plan']))
    render(
      <QueryClientProvider client={client}>
        <ActiveCountWarning warehouseId={WAREHOUSE_ID} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/يوجد جرد جارٍ لهذا المستودع بالفعل/)).toBeInTheDocument()
    expect(screen.getByText(/EIAMS-CNT-2026-0109/)).toBeInTheDocument()
  }, 15000)

  it('renders nothing when no active count exists', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts`, () =>
        HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 1 },
        }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.plan']))
    const { container } = render(
      <QueryClientProvider client={client}>
        <ActiveCountWarning warehouseId={WAREHOUSE_ID} />
      </QueryClientProvider>,
    )

    // Wait until the (empty) query settles, then assert no alert is rendered.
    await screen.findByText('يوجد جرد جارٍ لهذا المستودع بالفعل').catch(() => undefined)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  }, 15000)

  it('renders nothing before a warehouse is selected', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.plan']))
    const { container } = render(
      <QueryClientProvider client={client}>
        <ActiveCountWarning warehouseId="" />
      </QueryClientProvider>,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
