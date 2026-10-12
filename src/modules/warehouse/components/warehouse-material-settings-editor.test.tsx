import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shared/ui/toaster'
import { createWarehouseMaterialSetting, fixtureUuid } from '@/test/msw/factories'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { apiJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import type {
  CreateWarehouseMaterialSettingRequest,
  UpdateWarehouseMaterialSettingRequest,
} from '@/modules/warehouse/types/warehouse.api-types'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { WarehouseMaterialSettingsEditor } from './warehouse-material-settings-editor'

const API_BASE_URL = '/api/v1'

const WAREHOUSE_ID = fixtureUuid(30)
const SETTING_ID = fixtureUuid(72)

/**
 * Materials in the REAL catalog wire shape. `wireMaterial` from
 * `catalog-wire-fixtures.ts` mints `catalog.api-types.Material`, which is what
 * `GET /catalog/materials` serves and what `catalogService.listMaterials` is
 * typed against — its identifier is `id`, not `materialId`, and it carries no
 * `rowVersion`.
 */
const INK = wireMaterial({
  id: fixtureUuid(62),
  nameAr: 'حبر أسود',
  code: 'INK-001',
  status: 'Active',
})
const PC = wireMaterial({
  id: fixtureUuid(63),
  nameAr: 'حاسوب مكتبي',
  code: 'PC-001',
  status: 'Active',
})

const MATERIAL_PICKER_PLACEHOLDER = 'اكتب اسم المادة للبحث...'

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

type CreateCapture = {
  bodies: CreateWarehouseMaterialSettingRequest[]
  requestCount: number
}
type UpdateCapture = {
  bodies: UpdateWarehouseMaterialSettingRequest[]
  requestCount: number
}

// `POST /warehouse-material-settings` — the create path. The body
// carries `warehouseId` because the route does not encode it.
function createHandler(capture: CreateCapture) {
  return http.post(`${API_BASE_URL}/warehouse-material-settings`, async ({ request }) => {
    capture.requestCount += 1
    const body = (await request.json()) as CreateWarehouseMaterialSettingRequest
    capture.bodies.push(body)
    return apiJson({ id: SETTING_ID }, { status: 201 })
  })
}

// `PUT /warehouse-material-settings/{settingId}` — the per-setting
// update path. Body carries ONLY min/max; the route already names
// the setting and the warehouse.
function updateHandler(capture: UpdateCapture) {
  return http.put(
    `${API_BASE_URL}/warehouse-material-settings/${SETTING_ID}`,
    async ({ request }) => {
      capture.requestCount += 1
      const body = (await request.json()) as UpdateWarehouseMaterialSettingRequest
      capture.bodies.push(body)
      return new Response(null, { status: 200 })
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
  const alertDialog = await screen.findByRole('alertdialog', {
    name: 'تأكيد حفظ إعداد المادة',
  })
  fireEvent.click(within(alertDialog).getByRole('button', { name: 'حفظ الإعداد' }))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('WarehouseMaterialSettingsEditor', () => {
  it('creates a setting: searches materials, fills thresholds, confirms, and POSTs', async () => {
    const createCapture: CreateCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), createHandler(createCapture))

    const { onOpenChange } = renderEditor({ settings: [], setting: null })

    fireEvent.input(materialPicker(), { target: { value: 'حبر' } })
    fireEvent.click(await screen.findByRole('option', { name: 'حبر أسود' }))

    await userEvent.type(screen.getByLabelText('الحد الأدنى'), '2')
    await userEvent.type(screen.getByLabelText('الحد الأعلى'), '10')

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await confirmFromDialog()

    await waitFor(() => expect(createCapture.requestCount).toBe(1))
    expect(createCapture.bodies[0]).toEqual({
      warehouseId: WAREHOUSE_ID,
      materialId: INK.id,
      minQuantity: 2,
      maxQuantity: 10,
    })
    await waitFor(() => {
      const matches = screen.getAllByText('تمت إضافة إعداد المادة.')
      expect(matches.length).toBeGreaterThan(0)
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('edits an existing setting: material is locked, thresholds update, no rowVersion in body', async () => {
    // The wire carries no rowVersion. The frontend must not invent one and the
    // body must NOT include it (unknown request properties are silently
    // accepted today, so a stray rowVersion would pass — but the next
    // round-trip would not see it echoed, and a stale "version conflict"
    // error path would never trip).
    const existing = createWarehouseMaterialSetting({
      id: SETTING_ID,
      warehouseId: WAREHOUSE_ID,
      materialId: INK.id,
      materialCode: 'INK-001',
      materialNameAr: 'حبر أسود',
      minQuantity: 2,
      maxQuantity: 10,
      status: 'Active',
    })
    const updateCapture: UpdateCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), updateHandler(updateCapture))

    const { onOpenChange } = renderEditor({ settings: [existing], setting: existing })

    expect(screen.queryByPlaceholderText(MATERIAL_PICKER_PLACEHOLDER)).not.toBeInTheDocument()
    const materialInput = screen.getByLabelText('المادة')
    expect(materialInput).toBeDisabled()
    expect(materialInput).toHaveValue('حبر أسود')

    await userEvent.clear(screen.getByLabelText('الحد الأدنى'))
    await userEvent.type(screen.getByLabelText('الحد الأدنى'), '5')

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await confirmFromDialog()

    await waitFor(() => expect(updateCapture.requestCount).toBe(1))
    expect(updateCapture.bodies[0]).toEqual({
      minQuantity: 5,
      maxQuantity: 10,
    })
    expect(updateCapture.bodies[0]).not.toHaveProperty('rowVersion')
    expect(updateCapture.bodies[0]).not.toHaveProperty('warehouseId')
    expect(updateCapture.bodies[0]).not.toHaveProperty('materialId')
    expect(updateCapture.bodies[0]).not.toHaveProperty('status')
    await waitFor(() => {
      const matches = screen.getAllByText('تم حفظ تعديل إعداد المادة.')
      expect(matches.length).toBeGreaterThan(0)
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks submission when the upper threshold is below the lower threshold', async () => {
    const createCapture: CreateCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), createHandler(createCapture))

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
    expect(createCapture.requestCount).toBe(0)
  })

  it('excludes already-configured materials from the picker', async () => {
    const existing = createWarehouseMaterialSetting({
      id: SETTING_ID,
      warehouseId: WAREHOUSE_ID,
      materialId: INK.id,
      materialCode: 'INK-001',
      materialNameAr: 'حبر أسود',
      minQuantity: 1,
      maxQuantity: 5,
      status: 'Active',
    })
    const createCapture: CreateCapture = { bodies: [], requestCount: 0 }
    server.use(materialsHandler(), createHandler(createCapture))

    renderEditor({ settings: [existing], setting: null })

    fireEvent.input(materialPicker(), { target: { value: 'حبر' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'حبر أسود' })).not.toBeInTheDocument()
    })
    expect(createCapture.requestCount).toBe(0)
  })

  it('persists a status change through the dedicated status route as the int ordinal, never the threshold body', async () => {
    const existing = createWarehouseMaterialSetting({
      id: SETTING_ID,
      warehouseId: WAREHOUSE_ID,
      materialId: INK.id,
      materialCode: 'INK-001',
      materialNameAr: 'حبر أسود',
      minQuantity: 2,
      maxQuantity: 10,
      status: 'Active',
    })
    const updateCapture: UpdateCapture = { bodies: [], requestCount: 0 }
    const statusBodies: unknown[] = []
    server.use(
      materialsHandler(),
      updateHandler(updateCapture),
      http.put(
        `${API_BASE_URL}/warehouse-material-settings/${SETTING_ID}/status`,
        async ({ request }) => {
          statusBodies.push(await request.json())
          return new Response(null, { status: 200 })
        },
      ),
    )

    renderEditor({ settings: [existing], setting: existing })

    // Base UI Select: open the trigger (role combobox), then pick the option.
    await userEvent.click(screen.getByRole('combobox', { name: 'حالة الإعداد' }))
    await userEvent.click(await screen.findByRole('option', { name: 'غير نشط' }))

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإعداد' }))
    await confirmFromDialog()

    await waitFor(() => expect(updateCapture.requestCount).toBe(1))
    await waitFor(() => expect(statusBodies).toHaveLength(1))
    // Thresholds still ride the per-setting update route, unchanged.
    expect(updateCapture.bodies[0]).toEqual({ minQuantity: 2, maxQuantity: 10 })
    expect(updateCapture.bodies[0]).not.toHaveProperty('status')
    // Status rides the dedicated route as the INT ordinal (Inactive = 1).
    expect(statusBodies[0]).toEqual({ status: 1 })
  })
})
