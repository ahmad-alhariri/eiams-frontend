import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import CountDetailPage from './count-detail-page'
vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const API_BASE_URL = '/api/v1'
const COUNT_ID = '773e4567-e89b-42d3-a456-426614174099'

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

let startedBody: { rowVersion?: number } | undefined

function useHandlers() {
  startedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}`, () => {
      const count = {
        countId: COUNT_ID,
        referenceNumber: 'EIAMS-CNT-2026-0101',
        documentStatus: 'Planned',
        status: 'Planned',
        countType: 'Partial',
        freezePolicy: 'SoftFreeze',
        warehouse: { id: 'w1', displayName: 'المستودع المركزي', code: 'WH-01' },
        scope: {
          scopeType: 'ByCategory',
          scopeIds: [],
          summaryAr: 'أجهزة الحاسوب والطابعات',
        },
        createdBy: { id: 'u1', displayName: 'مدير الجرد' },
        createdAt: '2026-08-25T09:00:00Z',
        startedAt: null,
        completedAt: null,
        closedAt: null,
        notes: null,
        rowVersion: 1,
      }
      return HttpResponse.json(count)
    }),
    http.post(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/start`, async ({ request }) => {
      startedBody = (await request.json()) as { rowVersion?: number }
      return HttpResponse.json({
        countId: COUNT_ID,
        referenceNumber: 'EIAMS-CNT-2026-0101',
        documentStatus: 'InProgress',
        status: 'InProgress',
        countType: 'Partial',
        freezePolicy: 'SoftFreeze',
        warehouse: { id: 'w1', displayName: 'المستودع المركزي', code: 'WH-01' },
        scope: { scopeType: 'ByCategory', scopeIds: [], summaryAr: 'أجهزة الحاسوب والطابعات' },
        createdBy: { id: 'u1', displayName: 'مدير الجرد' },
        createdAt: '2026-08-25T09:00:00Z',
        startedAt: '2026-08-25T10:00:00Z',
        completedAt: null,
        closedAt: null,
        notes: null,
        rowVersion: 2,
      })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.start']))
  return render(
    <MemoryRouter initialEntries={[`/counts/${COUNT_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts/:countId" element={<CountDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CountDetailPage (e20-t04 scope/snapshot + e20-t05 start)', () => {
  it('shows the planned session spine and scope snapshot preview', async () => {
    useHandlers()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'جرد جزئي — EIAMS-CNT-2026-0101',
    )
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getByText('تجميد مرن (SoftFreeze)')).toBeInTheDocument()
    expect(screen.getAllByText('أجهزة الحاسوب والطابعات').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'بدء الجلسة والتقاط اللقطة' })).toBeInTheDocument()
  }, 20000)

  it('starts the session (captures snapshot) after confirmation', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('button', { name: 'بدء الجلسة والتقاط اللقطة' })
    await user.click(screen.getByRole('button', { name: 'بدء الجلسة والتقاط اللقطة' }))

    // Confirm dialog appears, confirm it.
    const confirmButton = await screen.findByRole('button', { name: 'بدء الجلسة' })
    await user.click(confirmButton)

    await waitFor(
      () => {
        expect(startedBody).toBeDefined()
      },
      { timeout: 8000 },
    )

    expect(startedBody?.rowVersion).toBe(1)
  }, 30000)
})
