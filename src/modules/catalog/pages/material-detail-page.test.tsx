import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type {
  Material,
  MaterialCategory,
  MaterialFamily,
  MaterialStatus,
  TrackingType,
} from '@/modules/catalog/types/catalog.types'

import MaterialDetailPage from './material-detail-page'

const API_BASE_URL = '/api/v1'
const MATERIAL_ID = fixtureUuid(60)
const FAMILY_ID = fixtureUuid(22)
const CATEGORY_ID = fixtureUuid(21)
const DOMAIN_ID = fixtureUuid(20)
const UNIT_ID = fixtureUuid(23)

const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'catalog.manage' && permissions.canManage,
  }),
}))

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (nested `materialDomain`/`materialCategory`/
 * `materialFamily`/`unit` references, `descriptionAr`, `rowVersion`) and no
 * longer typechecks against `catalog.api-types`.
 */
function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: MATERIAL_ID,
    familyId: FAMILY_ID,
    nameAr: 'حاسوب مكتبي',
    nameEn: 'Desktop Computer',
    code: 'IT-HW-PC-001',
    materialKind: 'Asset',
    trackingType: 'Serial',
    hasExpiry: false,
    requiresAssetNumber: true,
    catalogVersion: 4,
    attributes: '{"serial":"ABC"}',
    status: 'Active',
    materialDomainId: DOMAIN_ID,
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: UNIT_ID,
    baseUnitSymbol: 'EA',
    ...overrides,
  }
}

function makeFamily(): MaterialFamily {
  return {
    id: FAMILY_ID,
    categoryId: CATEGORY_ID,
    name: 'الحواسيب',
    code: 'IT-HW-PC',
    status: 'Active',
  }
}

function makeCategory(): MaterialCategory {
  return {
    id: CATEGORY_ID,
    materialDomainId: DOMAIN_ID,
    parentCategoryId: null,
    name: 'الأجهزة',
    code: 'IT-HW',
    status: 'Active',
  }
}

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[`/catalog/materials/${MATERIAL_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/catalog/materials/:materialId" element={children} />
          <Route path="/catalog/materials" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

/**
 * The detail screen embeds the per-material conversion table, which reads the
 * conversion list and the unit reference list on mount, and it resolves the
 * category step of the breadcrumb from the family and then the category. Every
 * answer must be enveloped — an unhandled request is a hard error under
 * `server.listen({ onUnhandledRequest: 'error' })`.
 */
function registerReferenceHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions`, () =>
      okPageJson([]),
    ),
    http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    http.get(`${API_BASE_URL}/catalog/families/${FAMILY_ID}`, () => okJson(makeFamily())),
    http.get(`${API_BASE_URL}/catalog/categories/${CATEGORY_ID}`, () => okJson(makeCategory())),
  )
}

describe('MaterialDetailPage', () => {
  afterEach(() => {
    permissions.canManage = false
  })

  it('renders the read-only hierarchy and D-MAT-01 asset policy', async () => {
    const material = makeMaterial()
    registerReferenceHandlers()
    server.use(http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)))

    render(<MaterialDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: material.nameAr })).toBeInTheDocument()
    // The domain name is FLAT on the material; the category and the family are
    // resolved by reading the family and then its category, because no catalog
    // projection nests a reference object any more. Those two extra reads are
    // awaited, not assumed to have landed with the material.
    expect(screen.getByText('تقنية المعلومات')).toBeInTheDocument()
    expect(await screen.findByText('الأجهزة')).toBeInTheDocument()
    expect(await screen.findByText('الحواسيب')).toBeInTheDocument()
    expect(screen.getByText(material.baseUnitSymbol)).toBeInTheDocument()
    // `attributes` is a JSON OBJECT STRING or null; `descriptionAr` was the
    // retired snapshot's field.
    expect(screen.getByText(material.attributes ?? '')).toBeInTheDocument()
    expect(screen.getByText('أصل ثابت')).toBeInTheDocument()
    expect(screen.getByText('بالتسلسل')).toBeInTheDocument()
    expect(screen.getByText('مطلوب (رقم أصل داخلي)')).toBeInTheDocument()
    // The version the update route echoes is visible here, not only in the form.
    expect(screen.getByText(String(material.catalogVersion))).toBeInTheDocument()
    // D-MAT-01 custody consequence for an asset, and the asset-registry record
    // it creates. The classification is `materialKind` + `requiresAssetNumber`.
    expect(
      screen.getByText('تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('states that Archived is terminal, because no route leaves that state', async () => {
    const status: MaterialStatus = 'Archived'
    const material = makeMaterial({ status })
    registerReferenceHandlers()
    server.use(http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)))

    render(<MaterialDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByText('مؤرشف نهائياً')).toBeInTheDocument()
  })

  it('keeps trackingType labelable for every member of the union', async () => {
    const trackingType: TrackingType = 'Quantity'
    const material = makeMaterial({ trackingType, materialKind: 'Durable' })
    registerReferenceHandlers()
    server.use(http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)))

    render(<MaterialDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByText('بكمية')).toBeInTheDocument()
    expect(screen.getByText('معمرة')).toBeInTheDocument()
  })

  it('deactivates an active material through the integer status command', async () => {
    const material = makeMaterial({ status: 'Active' })
    permissions.canManage = true
    const statusBodies: unknown[] = []
    const user = userEvent.setup()
    registerReferenceHandlers()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)),
      http.put(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    await user.click(await screen.findByRole('button', { name: 'تعطيل المادة' }))

    const confirmation = await screen.findByRole('alertdialog', { name: 'تعطيل مادة' })
    await user.click(within(confirmation).getByRole('button', { name: 'تعطيل المادة' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 1 }]))
  })

  it('offers no status action for an archived material, because Archived is terminal', async () => {
    const status: MaterialStatus = 'Archived'
    permissions.canManage = true
    const material = makeMaterial({ status })
    registerReferenceHandlers()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)),
      http.put(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/status`, () => {
        throw new Error('no status command may be fired from an archived material')
      }),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })

    // The badge states the terminal state; no button suggests a way out of it.
    expect(await screen.findByText('مؤرشف نهائياً')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعطيل المادة/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تنشيط المادة/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /أرشفة نهائية/ })).not.toBeInTheDocument()
  })

  it('warns in Arabic that archiving is terminal and offers no way back', async () => {
    const material = makeMaterial({ status: 'Inactive' })
    permissions.canManage = true
    const user = userEvent.setup()
    registerReferenceHandlers()
    server.use(http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(material)))

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    await user.click(await screen.findByRole('button', { name: 'أرشفة نهائية' }))

    const confirmation = await screen.findByRole('alertdialog', { name: 'أرشفة مادة' })
    expect(
      within(confirmation).getByText(/الأرشفة نهائية ولا يمكن التراجع عنها/),
    ).toBeInTheDocument()
    expect(
      within(confirmation).getByText(/لا يعرض النظام أي طريقة للخروج من حالة الأرشيف/),
    ).toBeInTheDocument()
  })

  it('retries an unavailable material and provides a return path', async () => {
    const material = makeMaterial()
    const user = userEvent.setup()
    let attempts = 0
    registerReferenceHandlers()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okJson(material)
      }),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل المادة' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: material.nameAr })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى الأصناف' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/materials')
  })

  it('shows a safe empty state when a successful response contains no material', async () => {
    const user = userEvent.setup()
    registerReferenceHandlers()
    server.use(http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => okJson(null)))

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'لا تتوفر بيانات المادة' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى الأصناف' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/materials')
  })
})
