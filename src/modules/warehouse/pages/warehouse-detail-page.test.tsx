import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createFieldError,
  createPage,
  createMaterialDomain,
  createProblemDetails,
  createSite,
  createWarehouse,
  createWarehouseCapability,
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
const WAREHOUSE_ID = '00000000-0000-4000-8000-00000000001e'

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
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/material-settings`, () =>
      HttpResponse.json(createPage([])),
    ),
    http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([createMaterialDomain()])),
  )
})

describe('WarehouseDetailPage', () => {
  it('renders details and gates editing without warehouse.manage', async () => {
    const warehouse = createWarehouse({ locationAr: null, status: 'Inactive' })
    const capability = createWarehouseCapability({ warehouseId: warehouse.warehouseId })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('heading', { name: warehouse.nameAr })).toBeInTheDocument()
    expect(screen.getByText(warehouse.site.displayName)).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(await screen.findByText('قدرات المستودع')).toBeInTheDocument()
    expect(screen.getByText(capability.domain.displayName)).toBeInTheDocument()
    expect(screen.getByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل المستودع' })).not.toBeInTheDocument()
  })

  it('retries a failed detail request and returns to the list', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({ warehouseId: warehouse.warehouseId })
    let attempts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(warehouse)
      }),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل المستودع' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: warehouse.nameAr })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى المستودعات' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/warehouses')
  })

  it('updates with rowVersion and the exact contract request for a permitted user', async () => {
    permissions.canManage = true
    const site = createSite()
    const warehouse = createWarehouse({
      rowVersion: 8,
      site: { id: site.siteId, displayName: site.nameAr },
    })
    const capability = createWarehouseCapability({ warehouseId: warehouse.warehouseId })
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json(warehouse)
      }),
    )
    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.nameAr })
    await user.click(screen.getByRole('button', { name: 'تعديل المستودع' }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('اسم المستودع')
    await user.clear(input)
    await user.type(input, 'المستودع المحدّث')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      siteId: site.siteId,
      code: warehouse.code,
      nameAr: 'المستودع المحدّث',
      locationAr: warehouse.locationAr,
      status: warehouse.status,
      rowVersion: 8,
    })
  })

  it('retries capabilities independently and keeps the warehouse profile available', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.warehouseId,
      operations: ['Transfer', 'Count', 'Return'],
    })
    let capabilityAttempts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () => {
        capabilityAttempts += 1
        return capabilityAttempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json([capability])
      }),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('heading', { name: warehouse.nameAr })).toBeInTheDocument()
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
      warehouseId: warehouse.warehouseId,
      domain: { id: domain.domainId, displayName: domain.nameAr },
      operations: ['Receiving', 'Issue'],
      rowVersion: 12,
    })
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.put(
        `${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`,
        async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json([capability])
        },
      ),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.nameAr })
    await user.click(await screen.findByRole('button', { name: 'تعديل القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'تعديل قدرات المستودع' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'تحويل' }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ قدرات المستودع' })
    await user.click(within(confirmation).getByRole('button', { name: 'حفظ القدرات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual([
      {
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
      warehouseId: warehouse.warehouseId,
      domain: { id: domain.domainId, displayName: domain.nameAr },
    })
    let puts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () => {
        puts += 1
        return HttpResponse.json([capability])
      }),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.nameAr })
    await user.click(await screen.findByRole('button', { name: 'تعديل القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'تعديل قدرات المستودع' })
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ قدرات المستودع' })
    await user.click(within(confirmation).getByRole('button', { name: 'إلغاء' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts).toBe(0)
  })

  it('shows a server validation error from the capability replacement request', async () => {
    permissions.canManage = true
    const warehouse = createWarehouse()
    const domain = createMaterialDomain()
    const capability = createWarehouseCapability({
      warehouseId: warehouse.warehouseId,
      domain: { id: domain.domainId, displayName: domain.nameAr },
    })
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.put(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json(
          createProblemDetails({
            fieldErrors: [
              createFieldError({
                field: 'capabilities',
                messageAr: 'تعارضت عمليات المجال مع سياسة المستودع.',
              }),
            ],
          }),
          { status: 422 },
        ),
      ),
    )

    render(<WarehouseDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: warehouse.nameAr })
    await user.click(await screen.findByRole('button', { name: 'تعديل القدرات' }))
    const dialog = screen.getByRole('dialog', { name: 'تعديل قدرات المستودع' })
    await user.click(within(dialog).getByRole('button', { name: 'حفظ القدرات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ قدرات المستودع' })
    await user.click(within(confirmation).getByRole('button', { name: 'حفظ القدرات' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'تعارضت عمليات المجال مع سياسة المستودع.',
    )
  })

  it('renders an accessible empty capability overview without write controls', async () => {
    const warehouse = createWarehouse()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([]),
      ),
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
