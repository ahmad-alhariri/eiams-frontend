import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPage, createSite, createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'warehouse.manage' && permissions.canManage,
  }),
}))

import WarehousesListPage from './warehouses-list-page'

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
  permissions.canManage = false
})

describe('WarehousesListPage', () => {
  it('renders contract-backed warehouse rows and sends zero-based server pagination', async () => {
    const warehouse = createWarehouse()
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([warehouse], { totalItems: 11, totalPages: 2 }))
      }),
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([createSite()]))),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المستودعات' })).toBeInTheDocument()
    expect(await screen.findByText(warehouse.nameAr)).toBeInTheDocument()
    expect(screen.getByText(warehouse.code)).toBeInTheDocument()
    expect(screen.getByText(warehouse.site.displayName)).toBeInTheDocument()
    expect(screen.getByText(warehouse.locationAr ?? '')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة|تعديل/ })).not.toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('sends selected site and status filters to the server', async () => {
    const user = userEvent.setup()
    const site = createSite()
    const receivedFilters: Array<{ siteId: string | null; status: string | null }> = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          siteId: url.searchParams.get('siteId'),
          status: url.searchParams.get('status'),
        })
        return HttpResponse.json(
          createPage([createWarehouse({ site: { id: site.siteId, displayName: site.nameAr } })]),
        )
      }),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.nameAr }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة المستودع' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({ siteId: site.siteId, status: 'Inactive' }),
    )
  })

  it('renders an accessible Arabic error state and retries the failed list request', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/warehouses`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createWarehouse()]))
      }),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل المستودعات' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('المستودع المركزي')).toBeInTheDocument()
  })

  it('shows the Arabic empty state when the scoped server page has no warehouses', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد مستودعات' })).toBeInTheDocument()
  })

  it('gates creation behind warehouse.manage and posts the exact WarehouseUpsertRequest', async () => {
    permissions.canManage = true
    const site = createSite()
    let receivedBody: unknown = null
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json(createWarehouse(), { status: 201 })
      }),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مستودع' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.nameAr }))
    await user.type(within(dialog).getByLabelText('اسم المستودع'), 'المستودع الفرعي')
    await user.type(within(dialog).getByLabelText('رمز المستودع'), 'WH-SUB')
    await user.type(within(dialog).getByLabelText('الموقع التفصيلي'), '  دمشق  ')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المستودع' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      siteId: site.siteId,
      code: 'WH-SUB',
      nameAr: 'المستودع الفرعي',
      locationAr: 'دمشق',
      status: 'Active',
      rowVersion: 0,
    })
  })

  it('renders local and server field errors in the Arabic create form', async () => {
    permissions.canManage = true
    const site = createSite()
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.post(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(
          {
            code: 'validation.failed',
            detailAr: 'تعذّر التحقق من البيانات المدخلة.',
            fieldErrors: [{ field: 'code', code: 'duplicate', messageAr: 'رمز المستودع مستخدم.' }],
            status: 422,
            titleAr: 'تعذّر إتمام الطلب',
            traceId: 'trace',
            type: 'https://example.test/problem',
          },
          { status: 422 },
        ),
      ),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مستودع' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المستودع' }))
    expect(await within(dialog).findByText('يجب اختيار موقع صالح.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('combobox', { name: 'الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.nameAr }))
    await user.type(within(dialog).getByLabelText('اسم المستودع'), 'مستودع')
    await user.type(within(dialog).getByLabelText('رمز المستودع'), 'WH-DUP')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المستودع' }))
    expect(await within(dialog).findByText('رمز المستودع مستخدم.')).toBeInTheDocument()
  })
})
