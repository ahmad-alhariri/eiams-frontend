import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import type { StockMovement } from '@/shared/types/generated/eiams-v1'
import { createNamedReference, createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import StockMovementsPage from './stock-movements-page'

const API_BASE_URL = '/api/v1'

function createMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    documentId: fixtureUuid(60),
    documentLineId: fixtureUuid(61),
    documentReference: 'RCP-2026-0001',
    material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
    movementId: fixtureUuid(70),
    movementType: 'Receipt',
    postedAt: '2026-08-21T10:00:00.000Z',
    postedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
    quantityDelta: 5,
    warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
    ...overrides,
  }
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
  it('renders the immutable Arabic ledger and sends default server ordering with zero-based pagination', async () => {
    const movement = createMovement()
    let requestQuery: Record<string, string> | undefined
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, ({ request }) => {
        requestQuery = Object.fromEntries(new URL(request.url).searchParams)
        return HttpResponse.json(createPage([movement], { totalItems: 11, totalPages: 2 }))
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
    expect(screen.getByRole('link', { name: 'عرض تفاصيل حركة 00000000…' })).toHaveAttribute(
      'href',
      `/inventory/movements/${movement.movementId}`,
    )
    expect(screen.queryByRole('button', { name: /إضافة|تعديل|حذف/ })).not.toBeInTheDocument()
    expect(requestQuery).toMatchObject({
      pageIndex: '0',
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
        return HttpResponse.json(createPage([createMovement()], { totalItems: 21, totalPages: 3 }))
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['pageIndex']).toBe('1'))

    await user.click(screen.getByRole('button', { name: 'التغير في الرصيد' }))
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        pageIndex: '0',
        sortBy: 'QuantityDelta',
        sortDirection: 'Ascending',
      }),
    )

    fireEvent.change(screen.getByLabelText('من تاريخ الترحيل'), {
      target: { value: '2026-08-01T08:30' },
    })
    await waitFor(() => {
      expect(requests.at(-1)?.['pageIndex']).toBe('0')
      expect(requests.at(-1)?.['dateFrom']).toMatch(/^2026-08-01T.*Z$/)
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
        return HttpResponse.json(createPage([createMovement()]))
      }),
    )

    render(<StockMovementsPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب نوع الحركة' }))
    await user.click(await screen.findByRole('option', { name: 'تحويل صادر' }))

    await waitFor(() => expect(requests.at(-1)?.['movementType']).toBe('TransferOut'))
    expect(screen.queryByRole('option', { name: /إرجاع/ })).not.toBeInTheDocument()
  })

  it('renders accessible Arabic error and empty states and allows a retry', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([]))
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
