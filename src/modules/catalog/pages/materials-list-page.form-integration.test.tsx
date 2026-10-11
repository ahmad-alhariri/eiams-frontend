import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MaterialsListPage from '@/modules/catalog/pages/materials-list-page'
import { errJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type { Material, MaterialFamily, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permission = vi.hoisted(() => ({ canManage: true }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => permission.canManage && code === 'catalog.manage',
    hasAll: () => false,
    hasAny: () => false,
  }),
}))

// A 409 is answered by the recovery dialog and by NOTHING else. Asserting the
// toast manager was never called is how that stays true.
vi.mock('@/shared/ui/toast-manager', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
}))

import { toast } from '@/shared/ui/toast-manager'

const API_BASE_URL = '/api/v1'

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialId`, `materialFamilyId`, `unitId`,
 * `nameAr`, nested references, `rowVersion`) and no longer typechecks against
 * `catalog.api-types`.
 */
function makeFamily(): MaterialFamily {
  return {
    id: fixtureUuid(22),
    categoryId: fixtureUuid(21),
    name: 'الحواسيب',
    code: 'IT-HW-PC',
    status: 'Active',
  }
}

function makeUnit(): UnitOfMeasure {
  return {
    id: fixtureUuid(23),
    name: 'قطعة',
    symbol: 'EA',
    unitType: 'Quantity',
    status: 'Active',
  }
}

function makeMaterial(): Material {
  return {
    id: fixtureUuid(60),
    familyId: fixtureUuid(22),
    nameAr: 'حاسوب مكتبي',
    nameEn: 'Desktop Computer',
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 5,
    attributes: null,
    status: 'Active',
    materialDomainId: fixtureUuid(20),
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: fixtureUuid(23),
    baseUnitSymbol: 'EA',
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function registerReferenceHandlers() {
  const family = makeFamily()
  const unit = makeUnit()
  const material = makeMaterial()

  server.use(
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material], { page: 1 })),
    http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
    http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([unit])),
  )

  return { family, material, unit }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permission.canManage = true
  vi.clearAllMocks()
})

describe('MaterialsListPage material form integration', () => {
  it('opens the material core form through the RBAC-gated create control', async () => {
    const user = userEvent.setup()
    registerReferenceHandlers()

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مادة' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('اسم المادة')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'إضافة المادة' })).toBeInTheDocument()
  })

  it('sends the update body with expectedCatalogVersion and nothing immutable', async () => {
    const user = userEvent.setup()
    const { material } = registerReferenceHandlers()
    let received: unknown

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, async ({ request }) => {
        received = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: `تعديل ${material.nameAr}` }))
    const dialog = await screen.findByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم المادة')
    await user.clear(nameInput)
    await user.type(nameInput, 'حاسوب محمول')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(received).not.toBeNull())
    // The update record binds exactly these members plus the REQUIRED version
    // token echoed from the read. `rowVersion` is a field no catalog entity
    // except Material's `catalogVersion` equivalent ever had, and the material
    // update used to send it — answered with 400 REQUEST_VALIDATION_FAILED.
    expect(received).toEqual({
      nameAr: 'حاسوب محمول',
      nameEn: material.nameEn,
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      attributes: null,
      expectedCatalogVersion: material.catalogVersion,
    })
    expect(received).not.toHaveProperty('rowVersion')
    // Create-only members never leave the form on an update.
    expect(received).not.toHaveProperty('familyId')
    expect(received).not.toHaveProperty('baseUnitId')
    expect(received).not.toHaveProperty('code')
    expect(received).not.toHaveProperty('requiresAssetNumber')
    expect(received).not.toHaveProperty('status')
    expect(toast.success).toHaveBeenCalled()
  })

  it('answers a 409 material update with the recovery dialog and no toast', async () => {
    const user = userEvent.setup()
    const { material } = registerReferenceHandlers()
    vi.clearAllMocks()

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, () =>
        errJson(409, {
          code: 'MATERIALS_CATALOG_VERSION_MISMATCH',
          message: 'The material changed since it was read.',
          details: {
            material_id: material.id,
            expected_catalog_version: material.catalogVersion,
            current_catalog_version: material.catalogVersion + 1,
          },
        }),
      ),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: `تعديل ${material.nameAr}` }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('اسم المادة'))
    await user.type(within(dialog).getByLabelText('اسم المادة'), 'حاسوب محمول')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    // The dialog IS the whole response to a 409: neither a success toast nor a
    // generic error toast, and the edit dialog stays put so the row stays
    // visible under it.
    const recovery = await screen.findByRole('alertdialog', {
      name: 'تغيّرت المادة على خادم النظام',
    })
    expect(
      within(recovery).getByRole('button', { name: 'تحميل النسخة الحالية' }),
    ).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()

    await user.click(within(recovery).getByRole('button', { name: 'البقاء على المعروض' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'تغيّرت المادة على خادم النظام' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('does not render material mutations for a session without catalog management', async () => {
    permission.canManage = false
    registerReferenceHandlers()

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(screen.queryByRole('button', { name: 'إضافة مادة' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /أرشفة/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعطيل/ })).not.toBeInTheDocument()
  })
})
