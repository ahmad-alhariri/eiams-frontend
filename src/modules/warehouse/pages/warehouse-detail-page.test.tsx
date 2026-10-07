import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import {
  createMaterialDomain,
  createOrganizationalUnit,
  createSite,
  createWarehouse,
  createWarehouseCapability,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))
vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'warehouse.manage' && permissions.canManage,
  }),
}))

import WarehouseDetailPage from './warehouse-detail-page'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(30)

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}
function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[`/warehouses/${WAREHOUSE_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/warehouses/:warehouseId" element={children} />
          <Route path="/warehouses" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}
afterEach(() => {
  permissions.canManage = false
})

beforeEach(() => {
  server.use(
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/material-settings`, () => okPageJson([])),
    http.get(`${API_BASE_URL}/catalog/material-domains`, () =>
      okPageJson([createMaterialDomain()]),
    ),
    http.get(`${API_BASE_URL}/sites`, () => okPageJson([createSite()])),
    http.get(`${API_BASE_URL}/organizational-units`, () =>
      okPageJson([createOrganizationalUnit()]),
    ),
  )
})

describe('WarehouseDetailPage', () => {
  it('renders details and gates editing without warehouse.manage', async () => {
    const warehouse = createWarehouse({ status: 'Inactive' })
    const capability = createWarehouseCapability({ warehouseId: warehouse.id })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    // `siteId` is FLAT and carries no label, so the location resolves by joining
    // the sites list — there is no nested `site.displayName` to read.
    expect(createSite().id).toBe(warehouse.siteId)
    expect(screen.getByText(createSite().name)).toBeInTheDocument()
    expect(screen.getByText(warehouse.code)).toBeInTheDocument()
    // `locationAr` is gone from the wire and from the page; `warehouseType` and
    // `canHoldStock` occupy the detail fields instead.
    expect(screen.getByText(warehouse.warehouseType)).toBeInTheDocument()
    expect(screen.getByText('نعم')).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(await screen.findByText('قدرات المستودع')).toBeInTheDocument()
    expect(screen.getByText(capability.domain.displayName)).toBeInTheDocument()
    expect(screen.getByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل المستودع' })).not.toBeInTheDocument()
  })

  it('shows a dash for the location when the site is not in the sites list', async () => {
    const warehouse = createWarehouse({ siteId: fixtureUuid(951) })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () => okJson([])),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    const locationField = screen.getByText('الموقع').closest('div')
    expect(within(locationField as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('retries a failed detail request and returns to the list', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({ warehouseId: warehouse.id })
    let attempts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => {
        attempts += 1
        return attempts === 1
          ? apiJson({ detailAr: 'تعذّر جلب بيانات المستودع.' }, { status: 500 })
          : okJson(warehouse)
      }),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل المستودع' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى المستودعات' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/warehouses')
  })

  it('sends the read rowVersion verbatim and the exact update body for a permitted user', async () => {
    permissions.canManage = true
    const warehouse = createWarehouse({ rowVersion: 8 })
    const capability = createWarehouseCapability({ warehouseId: warehouse.id })
    const orgUnit = createOrganizationalUnit()
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.id}`, async ({ request }) => {
        receivedBody = await request.json()
        // `PUT /warehouses/{id}` answers with an empty body.
        return new Response(null, { status: 204 })
      }),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.name })
    await user.click(screen.getByRole('button', { name: 'تعديل المستودع' }))
    const dialog = screen.getByRole('dialog')
    // `siteId` and `code` are create-only: rendered disabled with the Arabic note.
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'يُحدَّد الموقع والرمز عند إنشاء المستودع ولا يمكن تعديلهما بعد ذلك.',
    )
    expect(within(dialog).getByLabelText('الرمز')).toBeDisabled()
    expect(within(dialog).getByRole('combobox', { name: 'الموقع' })).toBeDisabled()
    const input = within(dialog).getByLabelText('اسم المستودع')
    await user.clear(input)
    await user.type(input, 'المستودع المحدّث')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(receivedBody).not.toBeNull())
    // `PUT /warehouses/{id}` binds only these five fields. It sends NO `siteId`,
    // NO `code` and NO `status`; the concurrency token is the record's
    // `rowVersion` verbatim (8, never normalised to 0-based).
    expect(receivedBody).toEqual({
      organizationalUnitId: warehouse.organizationalUnitId,
      name: 'المستودع المحدّث',
      warehouseType: warehouse.warehouseType,
      canHoldStock: warehouse.canHoldStock,
      expectedRowVersion: 8,
    })
  })

  it('retries capabilities independently and keeps the warehouse profile available', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.id,
      operations: ['Transfer', 'Count', 'Return'],
    })
    let capabilityAttempts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () => {
        capabilityAttempts += 1
        return capabilityAttempts === 1
          ? apiJson({ detailAr: 'تعذّر جلب القدرات.' }, { status: 500 })
          : okJson([capability])
      }),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل قدرات المستودع')
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(capabilityAttempts).toBe(2))
    expect(await screen.findByText('تحويل')).toBeInTheDocument()
    expect(screen.getByText('جرد')).toBeInTheDocument()
    expect(screen.getByText('إرجاع')).toBeInTheDocument()
  })

  it('replaces permitted capability operations with the exact contract payload after confirmation', async () => {
    permissions.canManage = true
    const warehouse = createWarehouse()
    const domain = createMaterialDomain()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.id,
      domain: { id: domain.domainId, displayName: domain.nameAr },
      operations: ['Receiving', 'Issue'],
      rowVersion: 12,
    })
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, async ({ request }) => {
        receivedBody = await request.json()
        return okJson([capability])
      }),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.name })
    await user.click(await screen.findByRole('button', { name: 'إدارة القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'إدارة قدرات المستودع' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Transfer' }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ القدرات' })
    await user.click(within(confirmation).getByRole('button', { name: 'حفظ التغييرات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual([
      {
        warehouseId: warehouse.id,
        domainId: domain.domainId,
        operations: ['Receiving', 'Issue', 'Transfer'],
        rowVersion: 12,
      },
    ])
  })

  it('does not replace capabilities when the confirmation is cancelled', async () => {
    permissions.canManage = true
    const warehouse = createWarehouse()
    const domain = createMaterialDomain()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.id,
      domain: { id: domain.domainId, displayName: domain.nameAr },
    })
    let puts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () => {
        puts += 1
        return okJson([capability])
      }),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.name })
    await user.click(await screen.findByRole('button', { name: 'إدارة القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'إدارة قدرات المستودع' })
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ القدرات' })
    await user.click(within(confirmation).getByRole('button', { name: 'إلغاء' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts).toBe(0)
  })

  it('shows a server validation error from the capability replacement request', async () => {
    permissions.canManage = true
    const warehouse = createWarehouse()
    const domain = createMaterialDomain()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.id,
      domain: { id: domain.domainId, displayName: domain.nameAr },
    })
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        errJson(422, {
          code: 'WAREHOUSES_CANNOT_HOLD_STOCK',
          message: 'Warehouse capability conflicts with the material domain policy.',
          details: { capabilities: ['conflict'] },
        }),
      ),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.name })
    await user.click(await screen.findByRole('button', { name: 'إدارة القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'إدارة قدرات المستودع' })
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ القدرات' })
    await user.click(within(confirmation).getByRole('button', { name: 'حفظ التغييرات' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'لا يمكن لهذا المستودع الاحتفاظ بالمخزون.',
    )
  })

  it('renders an accessible empty capability overview without write controls', async () => {
    const warehouse = createWarehouse()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () => okJson([])),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'لا توجد قدرات معرّفة لهذا المستودع.',
    )
    expect(
      screen.queryByRole('button', { name: /قدرات|تعديل القدرات|حفظ القدرات/ }),
    ).not.toBeInTheDocument()
  })
})
