import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MaterialsListPage from '@/modules/catalog/pages/materials-list-page'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type {
  Material,
  MaterialFamily,
  MaterialStatus,
} from '@/modules/catalog/types/catalog.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'catalog.manage' && permissions.canManage,
  }),
}))

const API_BASE_URL = '/api/v1'

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialId`, a nested `unit` reference,
 * `nameAr`, `rowVersion`) and no longer typechecks against `catalog.api-types`.
 */
function makeFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  return {
    id: fixtureUuid(22),
    categoryId: fixtureUuid(21),
    name: 'الحواسيب',
    code: 'IT-HW-PC',
    status: 'Active',
    ...overrides,
  }
}

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: fixtureUuid(60),
    familyId: fixtureUuid(22),
    nameAr: 'حاسوب مكتبي',
    nameEn: null,
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 2,
    attributes: null,
    status: 'Active',
    materialDomainId: fixtureUuid(20),
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: fixtureUuid(23),
    baseUnitSymbol: 'EA',
    ...overrides,
  }
}

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permissions.canManage = false
})

describe('MaterialsListPage', () => {
  it('renders contract-backed materials and sends ONE-based server pagination', async () => {
    const family = makeFamily()
    const material = makeMaterial()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([material], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الأصناف' })).toBeInTheDocument()
    expect(await screen.findByText(material.nameAr)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: material.nameAr })).toHaveAttribute(
      'href',
      `/catalog/materials/${material.id}`,
    )
    // The material's base unit is a flat `baseUnitSymbol`; the `unit` reference
    // the frozen snapshot described is not on the wire.
    expect(screen.getByText(material.baseUnitSymbol)).toBeInTheDocument()
    expect(screen.getByText(family.name)).toBeInTheDocument()
    expect(screen.getByText('مستهلكة')).toBeInTheDocument()
    expect(screen.getByText('غير مطلوب')).toBeInTheDocument()
    // Table controls are one-based AND so is the wire. `ListMaterialsQuery`
    // declares `page`, which is the parameter the backend binds; `pageIndex` was
    // the snapshot's name and the server discards it. A `- 1` here is what put
    // `page=0` on the wire — answered with 400 REQUEST_VALIDATION_FAILED.
    expect(receivedPage).toBe('1')
    expect(receivedPageSize).toBe('10')
  })

  it('forwards family and status filters to the server', async () => {
    const user = userEvent.setup()
    const family = makeFamily()
    const receivedFilters: Array<{
      familyId: string | null
      status: string | null
    }> = []

    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          familyId: url.searchParams.get('familyId'),
          status: url.searchParams.get('status'),
        })
        return okPageJson([makeMaterial()])
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    await screen.findByText('حاسوب مكتبي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب العائلة' }))
    await user.click(await screen.findByRole('option', { name: family.name }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الصنف' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({
        familyId: family.id,
        status: 'Inactive',
      }),
    )
  })

  it('filters the loaded page by kind locally, because no materials list binds the kind', async () => {
    const user = userEvent.setup()
    const family = makeFamily()
    const receivedKinds: Array<string | null> = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        receivedKinds.push(new URL(request.url).searchParams.get('materialKind'))
        return okPageJson([makeMaterial({ materialKind: 'Asset' })])
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await screen.findByText('حاسوب مكتبي')
    await user.click(
      screen.getByRole('combobox', { name: 'تصفية حسب نوع الصنف ضمن الصفحة المعروضة' }),
    )
    await user.click(await screen.findByRole('option', { name: 'أصل ثابت' }))

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'تصفية حسب نوع الصنف ضمن الصفحة المعروضة' }),
      ).toHaveTextContent('أصل ثابت'),
    )
    // The Asset row survives the client-side filter.
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    // `GET /catalog/materials` binds `familyId`, `materialDomainId` and
    // `status` — never `materialKind`. Sending it was fiction.
    expect(receivedKinds.every((kind) => kind === null)).toBe(true)
  })

  it('debounces the search over the loaded page and retries a failed materials request', async () => {
    const user = userEvent.setup()
    const searches: string[] = []
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        attempts += 1
        searches.push(new URL(request.url).searchParams.get('search') ?? '')
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : okPageJson([makeMaterial()])
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الأصناف' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'حاسوب')

    await waitFor(() => expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument())
    // No materials list binds `search`, so the box filters the rows the server
    // already sent rather than issuing another request the server would ignore.
    expect(searches.every((search) => search === '')).toBe(true)
  })

  it('deactivates a material through the integer status command', async () => {
    permissions.canManage = true
    const material = makeMaterial()
    const statusBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: `تعطيل ${material.nameAr}` }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(within(confirmation).getByRole('button', { name: 'تعطيل المادة' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 1 }]))
  })

  it('warns in Arabic that archiving is terminal and offers no way back', async () => {
    permissions.canManage = true
    const material = makeMaterial()
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: `أرشفة ${material.nameAr}` }))

    const confirmation = await screen.findByRole('alertdialog', { name: 'أرشفة مادة' })
    // `Archived` is terminal server-side, so the copy says the state is final
    // and that the UI offers no route out of it.
    expect(
      within(confirmation).getByText(/الأرشفة نهائية ولا يمكن التراجع عنها/),
    ).toBeInTheDocument()
    expect(
      within(confirmation).getByText(/لا يعرض النظام أي طريقة للخروج من حالة الأرشيف/),
    ).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: 'أرشفة نهائية' })).toBeInTheDocument()
  })

  it('shows an Archived badge and hides every way back out of the archived state', async () => {
    permissions.canManage = true
    const status: MaterialStatus = 'Archived'
    const material = makeMaterial({ status })
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('مؤرشف نهائياً')).toBeInTheDocument()
    // Edit stays available (a descriptive edit is still legal), but the status
    // actions do not: no ordinal leaves `Archived`.
    expect(screen.getByRole('button', { name: `تعديل ${material.nameAr}` })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `تنشيط ${material.nameAr}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `أرشفة ${material.nameAr}` }),
    ).not.toBeInTheDocument()
  })
})
