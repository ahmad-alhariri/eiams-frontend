import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' } as { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { DashboardPanel } from '@/modules/reports/components/dashboard-panel'

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
  server.resetHandlers()
})

describe('DashboardPanel', () => {
  it('renders KPI cards when the dashboard endpoint returns data', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/dashboard`, () =>
        HttpResponse.json({
          generatedAt: '2026-09-25T10:00:00.000Z',
          kpis: [
            {
              code: 'documents_posted',
              labelAr: 'المستندات المرحّلة',
              value: 38,
              unitAr: 'مستند',
              changePercent: 12.1,
            },
            {
              code: 'movements_this_period',
              labelAr: 'الحركات في الفترة',
              value: 127,
              unitAr: 'حركة',
              changePercent: -5.7,
            },
          ],
          movementTrend: [{ label: '١ محرّم', value: 12 }],
          assetStatusDistribution: [{ label: 'نشط', value: 412 }],
        }),
      ),
    )

    render(<DashboardPanel />, { wrapper: createWrapper() })

    // KPI cards should appear
    await waitFor(() => {
      expect(screen.getByText('المستندات المرحّلة')).toBeInTheDocument()
    })
    expect(screen.getByText('الحركات في الفترة')).toBeInTheDocument()
  })

  it('renders loading skeletons while fetching', () => {
    // Override with a slow response to allow skeleton assertion
    server.use(
      http.get(`${API_BASE_URL}/reports/dashboard`, () => new Promise(() => {})),
    )

    render(<DashboardPanel />, { wrapper: createWrapper() })

    // Skeleton elements should be present
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders error state when the endpoint returns an error', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/dashboard`, () =>
        HttpResponse.json({ message: 'Internal server error' }, { status: 500 }),
      ),
    )

    render(<DashboardPanel />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('renders charts section when data is available', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/dashboard`, () =>
        HttpResponse.json({
          generatedAt: '2026-09-25T10:00:00.000Z',
          kpis: [],
          movementTrend: [
            { label: '١ محرّم', value: 12 },
            { label: '٥ محرّم', value: 18 },
          ],
          assetStatusDistribution: [{ label: 'نشط', value: 412 }],
        }),
      ),
    )

    render(<DashboardPanel />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('اتجاه الحركات اليومية')).toBeInTheDocument()
    })
    expect(screen.getByText('توزيع حالات الأصول')).toBeInTheDocument()
  })

  it('renders the server timestamp when data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/dashboard`, () =>
        HttpResponse.json({
          generatedAt: '2026-09-25T10:00:00.000Z',
          kpis: [],
          movementTrend: [],
          assetStatusDistribution: [],
        }),
      ),
    )

    render(<DashboardPanel />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/آخر تحديث:/)).toBeInTheDocument()
    })
  })
})
