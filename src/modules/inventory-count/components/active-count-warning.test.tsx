import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ActiveCountWarning } from './active-count-warning'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '553e4567-e89b-42d3-a456-426614174005'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير الجرد' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

describe('ActiveCountWarning (e20-t09)', () => {
  it('shows the warning when an InProgress count exists for the warehouse', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts`, () =>
        okPageJson(
          [
            {
              countId: 'active-1',
              referenceNumber: 'EIAMS-CNT-2026-0109',
              documentStatus: 'InProgress',
              status: 'InProgress',
            },
          ],
          { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
        ),
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
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 }),
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
