import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import type { StockMovement } from '@/modules/inventory/types/inventory.api-types'
import { arMonthName, formatArabicDate } from '@/shared/ui/calendar-utils'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { createAuthTokenResponse } from '@/test/msw/factories'
import { wireStockMovement } from '@/test/msw/inventory-wire-fixtures'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import StockMovementsPage from './stock-movements-page'

const API_BASE_URL = '/api/v1'

/**
 * The ledger reads the handwritten wire contract, so the fixture is
 * `wireStockMovement` rather than the generated `createStockMovement`. The
 * material difference is `postedBy`: the C# `StockMovementResponse` projects
 * `Guid PostedBy`, so the wire value is a bare UUID string. The ledger's
 * "رُحّلت بواسطة" column renders exactly that string.
 */
function createMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return wireStockMovement(overrides)
}

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
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

describe('StockMovementsPage', () => {
  it('renders the immutable Arabic ledger and sends default server ordering with one-based pagination', async () => {
    const movement = createMovement()
    let requestQuery: Record<string, string> | undefined
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requestQuery = Object.fromEntries(new URL(request.url).searchParams)
        return okPageJson([movement], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'حركات المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('+٥')).toBeInTheDocument()
    expect(screen.getByText('RCP-2026-0001')).toBeInTheDocument()
    // `postedBy` is the UUID string the backend serves, so the ledger shows it
    // verbatim — there is no nested display name on the projection.
    expect(screen.getByText(movement.postedBy)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'عرض تفاصيل حركة 00000000…' })).toHaveAttribute(
      'href',
      `/inventory/movements/${movement.id}`,
    )
    expect(screen.queryByRole('button', { name: /إضافة|تعديل|حذف/ })).not.toBeInTheDocument()
    expect(requestQuery).toMatchObject({
      page: '1',
      pageSize: '10',
      sortBy: 'PostedAt',
      sortDirection: 'Descending',
    })
  })

  it('forwards only contracted sorting and resets the server page after a sort or filter change', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([createMovement()], {
          page: 1,
          pageSize: 10,
          totalCount: 21,
          totalPages: 3,
        })
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['page']).toBe('2'))

    await user.click(screen.getByRole('button', { name: 'التغير في الرصيد' }))
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        page: '1',
        sortBy: 'QuantityDelta',
        sortDirection: 'Ascending',
      }),
    )

    const today = new Date()
    const postedOn = new Date(today.getFullYear(), today.getMonth(), 15)
    await user.click(screen.getByRole('button', { name: 'من تاريخ الترحيل' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(postedOn) }))
    await waitFor(() => {
      expect(requests.at(-1)?.['page']).toBe('1')
      expect(requests.at(-1)?.['fromUtc']).toBe(postedOn.toISOString())
    })

    expect(screen.queryByRole('button', { name: 'مرجع المستند' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رُحّلت بواسطة' })).not.toBeInTheDocument()
  })

  it('applies the selected canonical movement type without a legacy Return option', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([createMovement()])
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب نوع الحركة' }))
    await user.click(await screen.findByRole('option', { name: 'تحويل صادر' }))

    await waitFor(() => expect(requests.at(-1)?.['movementType']).toBe('TransferOut'))
    expect(screen.queryByRole('option', { name: /إرجاع/ })).not.toBeInTheDocument()
  })

  it('renders Arabic RTL date pickers instead of native mm/dd/yyyy inputs', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, () => okPageJson([createMovement()])),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(document.querySelector('input[type="date"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'من تاريخ الترحيل' }))

    const calendar = screen.getByRole('grid').closest('[data-slot="calendar"]')
    expect(calendar).toHaveAttribute('dir', 'rtl')
    const today = new Date()
    expect(screen.getByText(`${arMonthName(today)} ${today.getFullYear()}`)).toBeInTheDocument()
    expect(screen.getByText('سبت')).toBeInTheDocument()
    expect(screen.queryByText(/mm\/dd\/yyyy/)).not.toBeInTheDocument()
  })

  it('renders the shared session-expired copy for a 401 instead of a connection message', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(createAuthTokenResponse())),
      http.get(`${API_BASE_URL}/inventory/movements`, () =>
        errJson(401, { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized.' }),
      ),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل حركات المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.')).toBeInTheDocument()
    expect(screen.queryByText(/تحقق من الاتصال/)).not.toBeInTheDocument()
  })

  it('renders accessible Arabic error and empty states and allows a retry', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([])
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper({ retry: false }) })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل حركات المخزون' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByRole('heading', { name: 'لا توجد حركات مخزون' })).toBeInTheDocument()
    expect(attempts).toBe(2)
  })
})
