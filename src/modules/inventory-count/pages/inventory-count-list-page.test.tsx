import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import InventoryCountListPage from './inventory-count-list-page'
import { createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

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
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'

function useCountHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('status')).toBe(null)
      return HttpResponse.json(
        createPage([
          {
            countId: COUNT_ID,
            countType: 'Partial',
            createdAt: '2026-08-18T08:00:00.000Z',
            createdBy: { id: fixtureUuid(90), displayName: 'مروان السيد' },
            freezePolicy: 'SoftFreeze',
            lineCount: 3,
            referenceNumber: 'EIAMS-CNT-2026-0001',
            rowVersion: 1,
            scope: { scopeIds: [], scopeType: 'ByCategory', summaryAr: 'أجهزة الحاسوب' },
            startedAt: '2026-08-18T09:00:00.000Z',
            status: 'InProgress',
            varianceCount: 0,
            warehouse: { id: fixtureUuid(30), displayName: 'المستودع المركزي' },
          },
        ]),
      )
    }),
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
    expect(await screen.findByText('EIAMS-CNT-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('جرد جزئي')).toBeInTheDocument()
    expect(screen.getByText('أجهزة الحاسوب')).toBeInTheDocument()
    const detailLink = screen.getByRole('link', { name: /EIAMS-CNT-2026-0001/ })
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
