import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiJson, okJson, okPageJson } from '@/test/msw/envelope'
import {
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
    has: (code: string) => (code === 'warehouse.manage' ? permissions.canManage : false),
  }),
}))

import WarehouseDetailPage from './warehouse-detail-page'

const API_BASE_URL = '/api/v1'

function LocationLogger() {
  const location = useLocation()
  return <span data-testid="current-path">{location.pathname}</span>
}

function renderPage(warehouseId: string) {
  return render(
    <MemoryRouter initialEntries={[`/warehouses/${warehouseId}`]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/warehouses" element={<LocationLogger />} />
          <Route path="/warehouses/:warehouseId" element={<WarehouseDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  permissions.canManage = false
  activeScope.key = { kind: 'enterprise' }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('WarehouseDetailPage', () => {
  it('renders the warehouse profile, site label, and capability operations in Arabic', async () => {
    const warehouse = createWarehouse({ rowVersion: 5 })
    const site = createSite({ id: warehouse.siteId })
    const capability = createWarehouseCapability({
      id: fixtureUuid(40),
      warehouseId: warehouse.id,
      materialDomainId: fixtureUuid(41),
      materialDomainName: 'تقنية المعلومات',
      materialDomainCode: 'IT',
      operations: ['Receiving', 'Issue'],
      status: 'Active',
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okPageJson([capability], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 }),
      ),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        okPageJson([
          createOrganizationalUnit({
            id: warehouse.organizationalUnitId ?? fixtureUuid(52),
          }),
        ]),
      ),
    )

    renderPage(warehouse.id)

    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    // The site is resolved by joining the sites list — the wire carries no
    // nested site reference on the warehouse. Rendering the joined label
    // proves the page is reading the live wire shape, not the
    // `locationAr`/`site.displayName` fiction.
    expect(screen.getByText(site.name)).toBeInTheDocument()
    expect(screen.getByText(warehouse.code)).toBeInTheDocument()
    expect(screen.getByText(warehouse.warehouseType)).toBeInTheDocument()
    expect(screen.getByText('نعم')).toBeInTheDocument()
    expect(await screen.findByText('قدرات المستودع')).toBeInTheDocument()
    expect(screen.getByText('تقنية المعلومات')).toBeInTheDocument()
    expect(screen.getByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل المستودع' })).not.toBeInTheDocument()
  })

  it('shows a dash for the location when the site is not in the sites list', async () => {
    const warehouse = createWarehouse({ siteId: fixtureUuid(951) })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
    )

    renderPage(warehouse.id)

    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    const locationField = screen.getByText('الموقع').closest('div')
    expect(within(locationField as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('retries capabilities independently and keeps the warehouse profile available', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({
      id: fixtureUuid(42),
      warehouseId: warehouse.id,
      materialDomainId: fixtureUuid(43),
      materialDomainName: 'تقنية المعلومات',
      materialDomainCode: 'IT',
      operations: ['Transfer', 'Count', 'Return'],
      status: 'Active',
    })
    let capabilityAttempts = 0
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () => {
        capabilityAttempts += 1
        return capabilityAttempts === 1
          ? apiJson({ detailAr: 'تعذّر جلب القدرات.' }, { status: 500 })
          : okPageJson([capability], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([createSite({ id: warehouse.siteId })])),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        okPageJson([
          createOrganizationalUnit({
            id: warehouse.organizationalUnitId ?? fixtureUuid(52),
          }),
        ]),
      ),
    )

    renderPage(warehouse.id)

    expect(await screen.findByRole('heading', { name: warehouse.name })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل قدرات المستودع')
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(capabilityAttempts).toBe(2))
    expect(await screen.findByText('تحويل')).toBeInTheDocument()
    expect(screen.getByText('جرد')).toBeInTheDocument()
    expect(screen.getByText('إرجاع')).toBeInTheDocument()
  })

  it('renders an accessible empty capability overview without write controls', async () => {
    const warehouse = createWarehouse()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([createSite({ id: warehouse.siteId })])),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, () =>
        okPageJson([], { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 }),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        okPageJson([
          createOrganizationalUnit({
            id: warehouse.organizationalUnitId ?? fixtureUuid(52),
          }),
        ]),
      ),
    )

    renderPage(warehouse.id)

    // The capability overview renders the empty state only after both
    // the warehouse detail AND the capability list have resolved, so we
    // wait for the warehouse heading to appear first; that guarantees
    // the warehouse query is no longer pending and the capability
    // section has had a chance to settle.
    await screen.findByRole('heading', { name: warehouse.name })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'لا توجد قدرات معرّفة لهذا المستودع.',
    )
  })
})
