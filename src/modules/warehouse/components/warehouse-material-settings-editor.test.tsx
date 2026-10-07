import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shared/ui/toaster'
import { createMaterial, createWarehouseMaterialSetting, fixtureUuid } from '@/test/msw/factories'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import type { Material } from '@/modules/catalog/types/catalog.api-types'
import type { WarehouseMaterialSettingUpsertRequest } from '@/modules/warehouse/types/warehouse.api-types'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { WarehouseMaterialSettingsEditor } from './warehouse-material-settings-editor'

const API_BASE_URL = '/api/v1'

const WAREHOUSE_ID = fixtureUuid(30)

/**
 * Re-projects the shared `createMaterial()` fixture onto the HANDWRITTEN catalog
 * contract, which is the shape `GET /catalog/materials` actually serves.
 *
 * The shared factory is still typed against the frozen generated snapshot and
 * mints `domain` / `category` / `family` / `baseUnit`; the catalog service is
 * typed against `catalog.api-types.Material`, which carries `materialDomain` /
 * `materialCategory` / `materialFamily` / `unit`. Serving the generated shape
 * here would have the fixture assert against a record the service is not typed
 * against — the same fiction the shared factory was left in for the document
 * suites. Mirrors the projection in the receiving/opening/transfer suites.
 */
function contractMaterial(overrides: Partial<Material> = {}): Material {
  const base = createMaterial()
  return {
    code: base.code,
    descriptionAr: base.descriptionAr ?? null,
    materialCategory: base.category,
    materialCategoryId: base.category.id,
    materialDomain: base.domain,
    materialDomainId: base.domain.id,
    materialFamily: base.family,
    materialFamilyId: base.family.id,
    materialId: base.materialId,
    materialKind: base.materialKind === 'Asset' ? 'Asset' : 'Consumable',
    nameAr: base.nameAr,
    nominalConversionFactor: 1,
    requiresAssetNumber: base.requiresAssetNumber,
    rowVersion: base.rowVersion,
    status: 'Active',
    unit: base.baseUnit,
    unitId: base.baseUnit.id,
    ...overrides,
  }
}

const INK = contractMaterial({
  materialId: fixtureUuid(62),
  nameAr: 'حبر أسود',
  code: 'INK-001',
  status: 'Active',
})
const PC = contractMaterial({
  materialId: fixtureUuid(63),
  nameAr: 'حاسوب مكتبي',
  code: 'PC-001',
  status: 'Active',
})

const MATERIAL_PICKER_PLACEHOLDER = 'اكتب اسم المادة للبحث...'
const STATUS_SELECT_NAME = 'حالة الإعداد'

function materialPicker() {
  return screen.getByPlaceholderText(MATERIAL_PICKER_PLACEHOLDER)
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function DialogWrapper({ children }: PropsWithChildren) {
    return (
      <>
        <Toaster />
        <MemoryRouter>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </MemoryRouter>
      </>
    )
  }
}

// `catalogService.listMaterials` reads the real envelope (`response.data.data`
// plus `pagination`). A bare `{ items, meta }` body therefore resolved to ZERO
// rows and the picker rendered no options at all.
function materialsHandler(materials = [INK, PC]) {
  return http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') ?? ''
    const items = materials.filter(
      (material) =>
        search === '' || material.nameAr.includes(search) || material.code.includes(search),
    )
    return okPageJson(items)
  })
}

type PutCapture = { bodies: WarehouseMaterialSettingUpsertRequest[]; requestCount: number }

function putHandler(capture: PutCapture) {
  return http.put(
    `${API_BASE_URL}/warehouses/:warehouseId/material-settings`,
    async ({ request }) => {
      capture.requestCount += 1
      const body = (await request.json()) as WarehouseMaterialSettingUpsertRequest
      capture.bodies.push(body)
      // `warehouseId` is NOT in the body — the route carries it, and the request
      // contract omits it.
      return okJson(
        createWarehouseMaterialSetting({
          warehouseId: WAREHOUSE_ID,
          material: { id: body.materialId, displayName: 'مادة مخزنية' },
          minQuantity: body.minQuantity ?? null,
          maxQuantity: body.maxQuantity ?? null,
          rowVersion: body.rowVersion,
          status: body.status,
        }),
      )
    },
  )
}

function renderEditor(props: {
  settings: Parameters<typeof WarehouseMaterialSettingsEditor>[0]['settings']
  setting: Parameters<typeof WarehouseMaterialSettingsEditor>[0]['setting']
}) {
  const onOpenChange = vi.fn()
  const view = render(
    <WarehouseMaterialSettingsEditor
      warehouseId={WAREHOUSE_ID}
      settings={props.settings}
      setting={props.setting}
      open
      onOpenChange={onOpenChange}
    />,
    { wrapper: createWrapper() },
  )
  return { onOpenChange, view }
}

async function confirmFromDialog() {
  const alertDialog = await screen.findByRole('alertdialog', { name: 'تأكيد حفظ إعداد المادة' })
  fireEvent.click(within(alertDialog).getByRole('button', { name: 'حفظ الإعداد' }))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('WarehouseMaterialSettingsEditor', () => {
  it('creates a setting: searches materials, fills thresholds, confirms, and PUTs', async () => {
    const capture: PutCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), putHandler(capture))

    const { onOpenChange } = renderEditor({ settings: [], setting: null })

    fireEvent.input(materialPicker(), { target: { value: 'حبر' } })
    fireEvent.click(await screen.findByRole('option', { name: 'حبر أسود' }))

    await userEvent.type(screen.getByLabelText('الحد الأدنى'), '2')
    await userEvent.type(screen.getByLabelText('الحد الأعلى'), '10')

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await confirmFromDialog()

    await waitFor(() => expect(capture.requestCount).toBe(1))
    expect(capture.bodies[0]).toEqual({
      materialId: INK.materialId,
      minQuantity: 2,
      maxQuantity: 10,
      rowVersion: 0,
      status: 'Active',
    })
    await waitFor(() => expect(screen.getByText('تمت إضافة إعداد المادة.')).toBeInTheDocument())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('edits an existing setting: material is locked, thresholds update, rowVersion preserved', async () => {
    // `materialId` and `material.id` are the same material on the wire and must
    // agree: the picker de-duplicates on `materialId`, so overriding only the
    // nested `material` reference left the setting pointing at fixtureUuid(24)
    // while the row it describes is fixtureUuid(62).
    const existing = createWarehouseMaterialSetting({
      warehouseId: WAREHOUSE_ID,
      materialId: INK.materialId,
      material: { id: INK.materialId, displayName: 'حبر أسود', code: 'INK-001' },
      minQuantity: 2,
      maxQuantity: 10,
      rowVersion: 3,
      status: 'Active',
    })
    const capture: PutCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), putHandler(capture))

    const { onOpenChange } = renderEditor({ settings: [existing], setting: existing })

    expect(screen.queryByPlaceholderText(MATERIAL_PICKER_PLACEHOLDER)).not.toBeInTheDocument()
    const materialInput = screen.getByLabelText('المادة')
    expect(materialInput).toBeDisabled()
    expect(materialInput).toHaveValue('حبر أسود')

    await userEvent.clear(screen.getByLabelText('الحد الأدنى'))
    await userEvent.type(screen.getByLabelText('الحد الأدنى'), '5')

    await userEvent.click(screen.getByRole('combobox', { name: STATUS_SELECT_NAME }))
    await userEvent.click(await screen.findByRole('option', { name: 'غير نشط' }))

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await confirmFromDialog()

    await waitFor(() => expect(capture.requestCount).toBe(1))
    expect(capture.bodies[0]).toEqual({
      materialId: INK.materialId,
      minQuantity: 5,
      maxQuantity: 10,
      rowVersion: 3,
      status: 'Inactive',
    })
    await waitFor(() => expect(screen.getByText('تم حفظ تعديل إعداد المادة.')).toBeInTheDocument())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks submission when the upper threshold is below the lower threshold', async () => {
    const capture: PutCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), putHandler(capture))

    renderEditor({ settings: [], setting: null })

    fireEvent.input(materialPicker(), { target: { value: 'حاسوب' } })
    fireEvent.click(await screen.findByRole('option', { name: 'حاسوب مكتبي' }))

    await userEvent.type(screen.getByLabelText('الحد الأدنى'), '10')
    await userEvent.type(screen.getByLabelText('الحد الأعلى'), '5')

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await waitFor(() =>
      expect(
        screen.getByText('الحد الأعلى يجب أن يكون أكبر من الحد الأدنى أو مساويًا له.'),
      ).toBeInTheDocument(),
    )
    expect(capture.requestCount).toBe(0)
  })

  it('excludes already-configured materials from the picker', async () => {
    const existing = createWarehouseMaterialSetting({
      warehouseId: WAREHOUSE_ID,
      materialId: INK.materialId,
      material: { id: INK.materialId, displayName: 'حبر أسود' },
      status: 'Active',
    })
    const capture: PutCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), putHandler(capture))

    renderEditor({ settings: [existing], setting: null })

    fireEvent.input(materialPicker(), { target: { value: 'سو' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'حبر أسود' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'حاسوب مكتبي' })).toBeInTheDocument()
    })
    expect(capture.requestCount).toBe(0)
  })
})
