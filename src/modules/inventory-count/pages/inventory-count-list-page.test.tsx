import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import InventoryCountListPage from './inventory-count-list-page'
import {
  fixtureUuid,
  createSessionUser,
  createSessionRole,
  createSessionScope,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { countNameHandlers } from '@/test/msw/count-wire-fixtures'
import {
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
} from '@/modules/inventory-count/types/inventory-count.types'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير الجرد' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'

function useCountHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('status')).toBe(null)
      return okPageJson([
        {
          id: COUNT_ID,
          warehouseId: fixtureUuid(30),
          countType: 'Cycle',
          scopeType: 'EntireWarehouse',
          freezePolicy: 'SoftFreeze',
          status: 'InProgress',
          rowVersion: 1,
          plannedAtUtc: '2026-08-18T08:00:00.000Z',
          startedAtUtc: '2026-08-18T09:00:00.000Z',
          completedAtUtc: null,
          closedAtUtc: null,
          abortedAtUtc: null,
        },
      ])
    }),
    ...countNameHandlers({ warehouses: { [fixtureUuid(30)]: 'W1' } }),
  )
}

function renderPage(permissionCodes: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/counts']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts" element={<InventoryCountListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('InventoryCountListPage (e20-t02)', () => {
  it('renders count sessions with Arabic type/scope labels and a detail link', async () => {
    useCountHandlers()
    renderPage(['count.view'])

    expect(
      await screen.findByRole('heading', { level: 1, name: 'جلسات الجرد' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(INVENTORY_COUNT_TYPE_LABELS_AR.Cycle)).toBeInTheDocument()
    expect(
      await screen.findByText(INVENTORY_COUNT_SCOPE_LABELS_AR.EntireWarehouse),
    ).toBeInTheDocument()
    const detailLink = screen.getByRole('link', { name: /\u0641\u062A\u062D/ })
    expect(detailLink.getAttribute('href')).toBe(`/counts/${COUNT_ID}`)
  })

  it('offers the create CTA to a user with count.plan', async () => {
    useCountHandlers()
    renderPage(['count.view', 'count.plan'])

    await screen.findByRole('heading', { level: 1, name: 'جلسات الجرد' })
    const cta = screen.getByRole('link', { name: 'جلسة جرد جديدة' })
    expect(cta.getAttribute('href')).toBe('/counts/new')
  })

  it('hides the create CTA without count.plan', async () => {
    useCountHandlers()
    renderPage(['count.view'])

    await screen.findByRole('heading', { level: 1, name: 'جلسات الجرد' })
    expect(screen.queryByRole('link', { name: 'جلسة جرد جديدة' })).toBeNull()
  })
})
