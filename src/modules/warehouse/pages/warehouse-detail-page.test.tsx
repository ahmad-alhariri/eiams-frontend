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
const permissions = vi.hoisted(() => ({ canManage: false, canCreateDocument: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => {
      if (code === 'warehouse.manage') return permissions.canManage
      if (code === 'document.create') return permissions.canCreateDocument
      return false
    },
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
  permissions.canCreateDocument = false
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

  // D-OPEN-02 (PRD §6.10): the warehouse detail page surfaces the
  // per-warehouse initialization badge from the read endpoint, and
  // offers the "initialize as zero-stock" action only when the
  // permission is granted AND the warehouse is still in the
  // NotInitialized state. A Site/Enterprise Manager (no
  // document.create) sees the badge but never the trigger.
  it('surfaces the zero-stock initialization trigger for a Warehouse-scoped Keeper on a NotInitialized warehouse', async () => {
    permissions.canCreateDocument = true
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
          createOrganizationalUnit({ id: warehouse.organizationalUnitId ?? fixtureUuid(52) }),
        ]),
      ),
      // NotInitialized + isZeroStock=false is the exact wire state the
      // page branches on to render the trigger.
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/initialization`, () =>
        okJson({
          warehouseId: warehouse.id,
          status: 'NotInitialized',
          sourceDocumentId: null,
          asOfDate: null,
          isZeroStock: false,
          initializedAtUtc: null,
          initializedBy: null,
          reversedAtUtc: null,
          reversedBy: null,
        }),
      ),
    )

    const user = userEvent.setup()
    renderPage(warehouse.id)

    // The badge subscribes to the read endpoint and renders once it
    // resolves. Waiting for the trigger implicitly proves the read also
    // resolved (the trigger branch checks the read state).
    const trigger = await screen.findByTestId('warehouse-zero-stock-trigger')
    expect(trigger).toHaveTextContent('تهيئة برصيد صفري')

    // Open the dialog: it carries the as-of-date input and the confirm
    // button, in Arabic.
    await user.click(trigger)
    const confirmButton = await screen.findByTestId('warehouse-zero-stock-confirm')
    const dialog = confirmButton.closest('[role="dialog"]') as HTMLElement
    expect(within(dialog).getByLabelText('تاريخ القطع')).toBeInTheDocument()
    expect(within(dialog).getByText('تأكيد التهيئة برصيد صفري')).toBeInTheDocument()
  })

  it('hides the zero-stock trigger when the warehouse is already initialized', async () => {
    permissions.canCreateDocument = true
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
          createOrganizationalUnit({ id: warehouse.organizationalUnitId ?? fixtureUuid(52) }),
        ]),
      ),
      // Initialized is the post-condition: the trigger must disappear
      // because the warehouse is already locked in.
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/initialization`, () =>
        okJson({
          warehouseId: warehouse.id,
          status: 'Initialized',
          sourceDocumentId: fixtureUuid(800),
          asOfDate: '2026-01-01',
          isZeroStock: false,
          initializedAtUtc: '2026-01-02T10:00:00.000Z',
          initializedBy: fixtureUuid(10),
          reversedAtUtc: null,
          reversedBy: null,
        }),
      ),
    )

    renderPage(warehouse.id)

    await screen.findByRole('heading', { name: warehouse.name })
    // The badge renders Initialized; the trigger never appears.
    expect(await screen.findByTestId('warehouse-initialization-badge')).toHaveAttribute(
      'data-status',
      'Initialized',
    )
    expect(screen.queryByTestId('warehouse-zero-stock-trigger')).not.toBeInTheDocument()
  })
})
