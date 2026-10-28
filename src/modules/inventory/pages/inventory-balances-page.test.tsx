import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createAuthTokenResponse,
  createInventoryBalance,
  createMaterial,
  createWarehouse,
} from '@/test/msw/factories'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import InventoryBalancesPage from './inventory-balances-page'

const API_BASE_URL = '/api/v1'

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

describe('InventoryBalancesPage', () => {
  it('renders the server page with default contract sort, Arabic low-stock labels, and one-based pagination', async () => {
    const balances = [
      createInventoryBalance({ lowStock: { state: 0, thresholdQuantity: 10 } }),
      createInventoryBalance({
        id: '00000000-0000-4000-8000-000000000041',
        lowStock: { state: 1, thresholdQuantity: 5 },
      }),
      createInventoryBalance({
        id: '00000000-0000-4000-8000-000000000042',
        lowStock: { state: 2, thresholdQuantity: null },
      }),
      createInventoryBalance({
        id: '00000000-0000-4000-8000-000000000043',
        lowStock: { state: 3, thresholdQuantity: null },
      }),
    ]
    let initialQuery: Record<string, string> | undefined

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        initialQuery ??= Object.fromEntries(new URL(request.url).searchParams)
        return okPageJson(balances, { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'أرصدة المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('منخفض')).toBeInTheDocument()
    expect(screen.getAllByText('المستودع المركزي')).toHaveLength(4)
    expect(screen.getAllByText('حاسوب مكتبي')).toHaveLength(4)
    expect(screen.getByText('الرصيد كافٍ')).toBeInTheDocument()
    expect(screen.getByText('حدّ التنبيه غير محدد')).toBeInTheDocument()
    expect(screen.getByText('تنبيه الانخفاض معطّل')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /عرض تفاصيل رصيد حاسوب مكتبي/ })[0]).toHaveAttribute(
      'href',
      `/inventory/balances/${balances[0]?.id}`,
    )
    expect(screen.getByLabelText('حدّ التنبيه: ١٠')).toBeInTheDocument()
    expect(screen.getByLabelText('حدّ التنبيه: ٥')).toBeInTheDocument()
    expect(initialQuery).toMatchObject({
      page: '1',
      pageSize: '10',
      sortBy: 'WarehouseDisplayName',
      sortDirection: 'Ascending',
    })
    expect(screen.getByRole('columnheader', { name: 'المستودع' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  it('labels its section as stock and links the open-custody view', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => okPageJson([createInventoryBalance()])),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('قائمة أرصدة المخزون')).toBeInTheDocument()
    expect(screen.getByText('المخزون')).toBeInTheDocument()
    expect(screen.getByText(/وليست العهد/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'سجل العهد' })).toHaveAttribute(
      'href',
      '/custody/active',
    )
  })

  it('sends contracted low-stock filters and server sort values, resetting pagination for both', async () => {
    const user = userEvent.setup()
    const receivedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        receivedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([createInventoryBalance()], {
          page: 1,
          pageSize: 10,
          totalCount: 20,
          totalPages: 2,
        })
      }),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(expect.objectContaining({ page: '2' })),
    )

    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة التنبيه' }))
    await user.click(await screen.findByRole('option', { name: 'منخفض' }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(
        expect.objectContaining({ lowStockState: 'Low', page: '1' }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'الرصيد' }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(
        expect.objectContaining({
          lowStockState: 'Low',
          page: '1',
          sortBy: 'Quantity',
          sortDirection: 'Ascending',
        }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'الرصيد' }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(
        expect.objectContaining({ sortBy: 'Quantity', sortDirection: 'Descending' }),
      ),
    )
  })

  it('uses the scoped warehouse and all-material selectors for server filters', async () => {
    const user = userEvent.setup()
    const warehouse = createWarehouse({ name: 'مستودع الأصول' })
    const assetMaterial = createMaterial({ materialKind: 'Asset', nameAr: 'طابعة أصلية' })
    const receivedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([assetMaterial])),
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        receivedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([createInventoryBalance()])
      }),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper() })
    await screen.findByText('المستودع المركزي')

    await user.type(screen.getByRole('combobox', { name: 'تصفية حسب المستودع' }), 'أص')
    await user.click(await screen.findByRole('option', { name: warehouse.name }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(
        expect.objectContaining({ warehouseId: warehouse.id }),
      ),
    )

    await user.type(screen.getByRole('combobox', { name: 'تصفية حسب المادة' }), 'طا')
    await user.click(await screen.findByRole('option', { name: assetMaterial.nameAr }))
    await waitFor(() =>
      expect(receivedQueries).toContainEqual(
        expect.objectContaining({
          materialId: assetMaterial.id,
          warehouseId: warehouse.id,
        }),
      ),
    )
  })

  it('renders the shared session-expired copy for a 401 instead of a connection message', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => okJson(createAuthTokenResponse())),
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        errJson(401, { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized.' }),
      ),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل أرصدة المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.')).toBeInTheDocument()
    expect(screen.queryByText(/تحقق من الاتصال/)).not.toBeInTheDocument()
  })

  it('renders accessible Arabic error, empty, and retry states', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([])
      }),
    )

    render(<InventoryBalancesPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل أرصدة المخزون' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: 'لا توجد أرصدة مخزون' })).toBeInTheDocument()
  })
})
