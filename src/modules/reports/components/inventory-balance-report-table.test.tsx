import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import type { InventoryReportRow } from '@/modules/reports/types/reports.types'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { InventoryBalanceReportTable } from '@/modules/reports/components/inventory-balance-report-table'

const API_BASE_URL = '/api/v1'

function createReportRow(overrides: Partial<InventoryReportRow> = {}): InventoryReportRow {
  return {
    materialId: '11111111-1111-4111-8111-111111111111',
    materialCode: 'IT-HW-PC-001',
    materialNameAr: 'حاسوب مكتبي',
    totalQuantity: 10,
    warehouseCount: 2,
    lastUpdatedUtc: '2026-08-21T10:00:00.000Z',
    ...overrides,
  }
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
  activeScope.key = { kind: 'enterprise' }
})

describe('InventoryBalanceReportTable', () => {
  it('renders Arabic per-material summary headers and server rows', async () => {
    const row = createReportRow()
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, () =>
        okPageJson([row], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
      ),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير أرصدة المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(row.materialCode)).toBeInTheDocument()
    expect(screen.getByText(row.materialNameAr)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'عدد المستودعات' })).toBeInTheDocument()
  })

  it('forwards the controller page parameter and resets it after a search change', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([createReportRow()], {
          page: 1,
          pageSize: 10,
          totalCount: 21,
          totalPages: 3,
        })
      }),
    )

    render(<InventoryBalanceReportTable />, { wrapper: createWrapper() })
    await screen.findByText('حاسوب مكتبي')

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['page']).toBe('2'))

    fireEvent.change(screen.getByRole('searchbox', { name: 'بحث' }), {
      target: { value: 'حاسوب' },
    })

    await waitFor(() => {
      const last = requests.at(-1)
      expect(last).toMatchObject({ page: '1', search: 'حاسوب' })
    })
  })

  it('renders an empty Arabic state when the server returns no rows', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/inventory`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
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
          : okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
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
