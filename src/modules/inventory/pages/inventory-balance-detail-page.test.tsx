import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createInventoryBalance, createProblemDetails, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import InventoryBalanceDetailPage from './inventory-balance-detail-page'

const API_BASE_URL = '/api/v1'
const BALANCE_ID = fixtureUuid(40)

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return (
    <MemoryRouter initialEntries={[`/inventory/balances/${BALANCE_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/inventory/balances/:balanceId" element={children} />
          <Route path="/inventory/balances" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

function MissingIdWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('InventoryBalanceDetailPage', () => {
  it('renders only the contract-backed balance projection in Arabic RTL', async () => {
    const balance = createInventoryBalance({
      lowStock: { state: 'Low', thresholdQuantity: 2.125 },
      quantity: 2.125,
    })
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/${balance.balanceId}`, () =>
        HttpResponse.json(balance),
      ),
    )

    render(<InventoryBalanceDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تفاصيل الرصيد' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(balance.warehouse.displayName)).toBeInTheDocument()
    expect(screen.getByText(balance.material.displayName)).toBeInTheDocument()
    expect(screen.getAllByText('٢٫١٢٥')).toHaveLength(2)
    expect(screen.getByText('منخفض')).toBeInTheDocument()
    expect(screen.getByText('حدّ التنبيه')).toBeInTheDocument()
    expect(screen.getByText('00000000…')).toBeInTheDocument()
    expect(
      screen.getByText('بيانات للقراءة فقط ضمن نطاق العمل الحالي، كما يعرضها الخادم.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل|إضافة|حفظ/ })).not.toBeInTheDocument()
  })

  it('shows neutral 404 copy without a retry and returns to the balance list', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/${BALANCE_ID}`, () =>
        HttpResponse.json(
          createProblemDetails({
            status: 404,
            code: 'inventory.balance.not_found',
            titleAr: 'الرصيد غير موجود',
            detailAr: 'يجب عدم عرض هذه الرسالة التفصيلية.',
          }),
          { status: 404 },
        ),
      ),
    )

    render(<InventoryBalanceDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: 'الرصيد غير متاح' })).toBeInTheDocument()
    expect(
      screen.getByText('لا يتوفر هذا الرصيد ضمن نطاق العمل الحالي، أو لم يعد موجوداً.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('يجب عدم عرض هذه الرسالة التفصيلية.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'العودة إلى الأرصدة' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/balances')
  })

  it('retries a non-404 detail failure and preserves the return action', async () => {
    const user = userEvent.setup()
    const balance = createInventoryBalance()
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/${balance.balanceId}`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(balance)
      }),
    )

    render(<InventoryBalanceDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل الرصيد' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText(balance.warehouse.displayName)).toBeInTheDocument()
  })

  it('does not request a balance when the route has no identifier', () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/:balanceId`, () => {
        requests += 1
        return HttpResponse.json(createInventoryBalance())
      }),
    )

    render(<InventoryBalanceDetailPage />, { wrapper: MissingIdWrapper })

    expect(screen.getByRole('heading', { name: 'تعذّر تحديد الرصيد' })).toBeInTheDocument()
    expect(requests).toBe(0)
  })
})
