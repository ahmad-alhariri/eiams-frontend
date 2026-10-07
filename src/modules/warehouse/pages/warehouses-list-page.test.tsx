import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiJson, errJson, okPageJson } from '@/test/msw/envelope'

import {
  createOrganizationalUnit,
  createSite,
  createWarehouse,
  fixtureUuid,
} from '@/test/msw/factories'
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
    const site = createSite()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([warehouse], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المستودعات' })).toBeInTheDocument()
    // `name` / `code` / `warehouseType` are the wire fields. `nameAr` and
    // `locationAr` were the frozen snapshot's fiction and are rendered nowhere.
    expect(await screen.findByRole('link', { name: warehouse.name })).toHaveAttribute(
      'href',
      `/warehouses/${warehouse.id}`,
    )
    expect(screen.getByText(warehouse.code)).toBeInTheDocument()
    expect(screen.getByText(warehouse.warehouseType)).toBeInTheDocument()
    // `siteId` is FLAT: the location column resolves the site NAME by joining the
    // sites list the page already fetches for its filter, because a warehouse
    // record carries no nested site object.
    expect(site.id).toBe(warehouse.siteId)
    expect(screen.getByText(site.name)).toBeInTheDocument()
    expect(screen.queryByText(site.location ?? '')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة|تعديل/ })).not.toBeInTheDocument()
    expect(receivedPage).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('falls back to a dash for a warehouse whose site is missing from the sites list', async () => {
    const warehouse = createWarehouse({ siteId: fixtureUuid(950) })

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([createSite()])),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: warehouse.name })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('sends selected site and status filters to the server', async () => {
    const user = userEvent.setup()
    const site = createSite()
    const receivedFilters: Array<{ siteId: string | null; status: string | null }> = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          siteId: url.searchParams.get('siteId'),
          status: url.searchParams.get('status'),
        })
        return okPageJson([createWarehouse({ siteId: site.id })])
      }),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    await screen.findByText('المستودع المركزي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.name }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة المستودع' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({ siteId: site.id, status: 'Inactive' }),
    )
  })

  it('renders an accessible Arabic error state and retries the failed list request', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses`, () => {
        attempts += 1
        return attempts === 1
          ? apiJson({ detailAr: 'تعذّر جلب المستودعات.' }, { status: 500 })
          : okPageJson([createWarehouse()])
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
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد مستودعات' })).toBeInTheDocument()
  })

  it('gates creation behind warehouse.manage and posts the exact WarehouseCreateRequest', async () => {
    permissions.canManage = true
    const site = createSite()
    const orgUnit = createOrganizationalUnit()
    let receivedBody: unknown = null
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        receivedBody = await request.json()
        return apiJson({ id: fixtureUuid(31) }, { status: 201 })
      }),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مستودع' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'الموقع' }))
    await user.click(await screen.findByRole('option', { name: /^المقر الرئيسي/ }))
    await user.click(within(dialog).getByRole('combobox', { name: 'الوحدة التنظيمية' }))
    await user.click(await screen.findByRole('option', { name: new RegExp(orgUnit.name) }))
    await user.type(within(dialog).getByLabelText('اسم المستودع'), 'المستودع الفرعي')
    await user.type(within(dialog).getByLabelText('الرمز'), '  WH-SUB  ')
    await user.type(within(dialog).getByLabelText('نوع المستودع'), 'Storage')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المستودع' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    // `POST /warehouses` binds exactly these six fields. It carries no `status`
    // (activation is a separate route) and no concurrency token, and there is no
    // `locationAr` anywhere in the body.
    expect(receivedBody).toEqual({
      siteId: site.id,
      organizationalUnitId: orgUnit.id,
      name: 'المستودع الفرعي',
      code: 'WH-SUB',
      warehouseType: 'Storage',
      canHoldStock: true,
    })
  })

  it('renders local and server field errors in the Arabic create form', async () => {
    permissions.canManage = true
    const site = createSite()
    const orgUnit = createOrganizationalUnit()
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
      http.post(`${API_BASE_URL}/warehouses`, () =>
        // A duplicate warehouse code is a real, specific backend condition:
        // WAREHOUSES_CODE_NOT_UNIQUE, 409 (WarehousesErrors.cs). The invented
        // `validation.failed` at 422 described a condition the API never reports,
        // and the `fieldErrors` array is a frontend shape the API never sends —
        // the wire carries `details` as `Record<fieldPath, string[]>`.
        errJson(409, {
          code: 'WAREHOUSES_CODE_NOT_UNIQUE',
          details: { code: ['The Code field is already in use.'] },
        }),
      ),
    )

    render(<WarehousesListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مستودع' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'الوحدة التنظيمية' }))
    await user.click(await screen.findByRole('option', { name: new RegExp(orgUnit.name) }))
    await user.type(within(dialog).getByLabelText('اسم المستودع'), 'مستودع')
    await user.type(within(dialog).getByLabelText('الرمز'), 'WH-DUP')
    await user.type(within(dialog).getByLabelText('نوع المستودع'), 'Storage')
    // `siteId` is create-only AND required, so the submit control stays disabled
    // until it is chosen — the form never posts an incomplete create body.
    expect(within(dialog).getByRole('button', { name: 'إضافة المستودع' })).toBeDisabled()

    await user.click(within(dialog).getByRole('combobox', { name: 'الموقع' }))
    await user.click(await screen.findByRole('option', { name: /^المقر الرئيسي/ }))
    expect(within(dialog).getByRole('button', { name: 'إضافة المستودع' })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المستودع' }))
    expect(await within(dialog).findByText('رمز المستودع مستخدم مسبقاً.')).toBeInTheDocument()
  })
})
