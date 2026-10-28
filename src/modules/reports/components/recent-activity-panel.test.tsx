import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { createAuditLog, createInventoryBalance } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { formatDateTime } from '@/shared/utils/format'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' },
}))

const session = vi.hoisted(() => ({
  has: (code: string) => session.codes.includes(code),
  codes: [] as string[],
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: session.has }),
}))

import { RecentActivityPanel } from '@/modules/reports/components/recent-activity-panel'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  session.codes = []
})

describe('RecentActivityPanel', () => {
  it('renders both the audit and low-stock sections when the caller holds both permissions', async () => {
    session.codes = ['audit.view', 'inventory.view']
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () =>
        HttpResponse.json({
          success: true,
          data: [createAuditLog({ action: 'UpdateDocument' })],
          pagination: {
            page: 1,
            page_size: 10,
            total_items: 1,
            total_pages: 1,
            has_previous_page: false,
            has_next_page: false,
            total_count: 1,
          },
          meta: { requestId: 'test', timestampUtc: '2026-09-01T00:00:00.000Z' },
        }),
      ),
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.json({
          success: true,
          data: [
            createInventoryBalance({
              lowStock: { state: 0, thresholdQuantity: 5 },
            }),
          ],
          pagination: {
            page: 1,
            page_size: 10,
            total_items: 1,
            total_pages: 1,
            has_previous_page: false,
            has_next_page: false,
            total_count: 1,
          },
          meta: { requestId: 'test', timestampUtc: '2026-09-01T00:00:00.000Z' },
        }),
      ),
    )

    render(<RecentActivityPanel />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 3, name: 'نشاط حديث' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'تنبيهات تشغيلية' })).toBeInTheDocument()
  })

  it('renders the audit row from the LIVE wire shape', async () => {
    session.codes = ['audit.view']
    // The live header (`AuditLogListItemResponse`) carries `id`, `createdAtUtc`,
    // `entityId` and `userId` — never `auditLogId`, `occurredAt`,
    // `entityDisplay` or `occurredBy`.
    const auditLog = createAuditLog({
      id: '11111111-1111-4111-8111-111111111111',
      entityId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      createdAtUtc: '2026-09-01T08:30:00.000Z',
    })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () =>
        HttpResponse.json({
          success: true,
          data: [auditLog],
          pagination: {
            page: 1,
            page_size: 10,
            total_items: 1,
            total_pages: 1,
            has_previous_page: false,
            has_next_page: false,
            total_count: 1,
          },
          meta: { requestId: 'test', timestampUtc: '2026-09-01T00:00:00.000Z' },
        }),
      ),
    )

    render(<RecentActivityPanel />, { wrapper: createWrapper() })

    expect(await screen.findByText(formatDateTime('2026-09-01T08:30:00.000Z'))).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'عرض تفاصيل سجل التدقيق 11111111…' }),
    ).toBeInTheDocument()
    expect(screen.getByText('22222222…')).toBeInTheDocument()
    expect(screen.getByText('33333333…')).toBeInTheDocument()

    // eiams-frontend-050j / 919b. The column reads `createdAtUtc` — the
    // CREATION time — so the panel must not label it as an event time.
    expect(screen.getByRole('columnheader', { name: 'تاريخ الإنشاء' })).toBeInTheDocument()
    expect(screen.queryByText('وقت الحدث')).not.toBeInTheDocument()
  })

  it('hides the audit section when audit.view is missing, and the inventory section when inventory.view is missing', async () => {
    session.codes = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () =>
        HttpResponse.json({
          success: true,
          data: [],
          pagination: {
            page: 1,
            page_size: 10,
            total_items: 0,
            total_pages: 0,
            has_previous_page: false,
            has_next_page: false,
            total_count: 0,
          },
          meta: { requestId: 'test', timestampUtc: '2026-09-01T00:00:00.000Z' },
        }),
      ),
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.json({
          success: true,
          data: [],
          pagination: {
            page: 1,
            page_size: 10,
            total_items: 0,
            total_pages: 0,
            has_previous_page: false,
            has_next_page: false,
            total_count: 0,
          },
          meta: { requestId: 'test', timestampUtc: '2026-09-01T00:00:00.000Z' },
        }),
      ),
    )

    render(<RecentActivityPanel />, { wrapper: createWrapper() })

    // Wait a tick so the queries resolve, then assert both sections are absent.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('heading', { name: 'نشاط حديث' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'تنبيهات تشغيلية' })).not.toBeInTheDocument()
    expect(await screen.findByText(/لا تتوفر لديك صلاحية/)).toBeInTheDocument()
  })
})
