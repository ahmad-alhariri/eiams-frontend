import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { okJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' } as { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import type { DashboardReport } from '@/modules/reports/types/reports.types'
import { DashboardPanel } from '@/modules/reports/components/dashboard-panel'

const API_BASE_URL = '/api/v1'

/**
 * The live dashboard payload: a singleton of FLAT counters
 * (`Application/Reports/Dashboard/DashboardReportResponse.cs:3-11`). There is
 * no kpi list and no series on the wire.
 */
const DASHBOARD: DashboardReport = {
  warehouseCount: 6,
  stockedMaterialCount: 7,
  totalOnHandQuantity: 531,
  assetCount: 15,
  activeCustodyCount: 6,
  openDocumentCount: 54,
  activeInventoryCountCount: 4,
  generatedAtUtc: '2026-10-27T04:14:19.3288988Z',
}

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
    server.use(http.get(`${API_BASE_URL}/reports/dashboard`, () => okJson(DASHBOARD)))

    render(<DashboardPanel />, { wrapper: createWrapper() })

    // KPI cards should appear
    await waitFor(() => {
      expect(screen.getByText('عدد المستودعات')).toBeInTheDocument()
    })
    expect(screen.getByText('عدد الأصول')).toBeInTheDocument()
    expect(screen.getByText('التكليفات النشطة')).toBeInTheDocument()
  })

  it('renders the server counters verbatim on the cards', async () => {
    server.use(http.get(`${API_BASE_URL}/reports/dashboard`, () => okJson(DASHBOARD)))

    render(<DashboardPanel />, { wrapper: createWrapper() })

    // The client labels the counters; every number is the server's own.
    await waitFor(() => {
      expect(screen.getByRole('article', { name: /عدد الأصول/ })).toHaveAttribute(
        'aria-label',
        'عدد الأصول: 15 أصل',
      )
    })
    expect(screen.getByRole('article', { name: /إجمالي الكمية المتوفرة/ })).toHaveAttribute(
      'aria-label',
      'إجمالي الكمية المتوفرة: 531 وحدة',
    )
  })

  it('renders no series surface — the live dashboard carries no trend or distribution', async () => {
    server.use(http.get(`${API_BASE_URL}/reports/dashboard`, () => okJson(DASHBOARD)))

    render(<DashboardPanel />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('عدد المستودعات')).toBeInTheDocument()
    })
    expect(screen.queryByText('اتجاه الحركات اليومية')).not.toBeInTheDocument()
    expect(screen.queryByText('توزيع حالات الأصول')).not.toBeInTheDocument()
  })

  it('renders loading skeletons while fetching', () => {
    // Override with a slow response to allow skeleton assertion
    server.use(http.get(`${API_BASE_URL}/reports/dashboard`, () => new Promise(() => {})))

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

  it('renders the server timestamp when data is loaded', async () => {
    server.use(http.get(`${API_BASE_URL}/reports/dashboard`, () => okJson(DASHBOARD)))

    render(<DashboardPanel />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/آخر تحديث:/)).toBeInTheDocument()
    })
  })
})
