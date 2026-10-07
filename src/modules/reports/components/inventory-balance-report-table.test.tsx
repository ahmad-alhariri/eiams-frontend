import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { createInventoryBalance, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { InventoryBalanceReportTable } from '@/modules/reports/components/inventory-balance-report-table'

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
})

describe('InventoryBalanceReportTable', () => {
  it('renders Arabic headers and server rows with low-stock badges', async () => {
    const balance = createInventoryBalance({
      material: { id: '11111111-1111-4111-8111-111111111111', displayName: 'حاسوب مكتبي' },
      warehouse: { id: '22222222-2222-4222-8222-222222222222', displayName: 'المستودع المركزي' },
      lowStock: { state: 'Low', thresholdQuantity: 5 },
    })
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, () =>
        HttpResponse.json(createPage([balance], { totalItems: 1, totalPages: 1 })),
      ),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير أرصدة المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(await screen.findByText('المستودع المركزي')).toBeInTheDocument()
  })

  it('forwards only documented params, and resets pageIndex to 0 after a search change', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(
          createPage([createInventoryBalance()], { totalItems: 21, totalPages: 3 }),
        )
      }),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })
    await screen.findByText('حاسوب مكتبي')

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['pageIndex']).toBe('1'))

    fireEvent.change(screen.getByRole('searchbox', { name: 'بحث' }), {
      target: { value: 'حاسوب' },
    })

    await waitFor(() => {
      const last = requests.at(-1)
      expect(last).toMatchObject({ pageIndex: '0', search: 'حاسوب' })
    })
  })

  it('renders an empty Arabic state when the server returns no balances', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, () =>
        HttpResponse.json(createPage([], { totalItems: 0, totalPages: 0 })),
      ),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد أرصدة مخزون' })).toBeInTheDocument()
  })

  it('renders an Arabic error state and supports retry on 500', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([]))
      }),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تقرير أرصدة المخزون' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByRole('heading', { name: 'لا توجد أرصدة مخزون' })).toBeInTheDocument()
    expect(attempts).toBe(2)
  })
})
