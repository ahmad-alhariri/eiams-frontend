import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AssetDisposalFormPage from '@/modules/adjustment/pages/asset-disposal-form-page'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { createPage, createSession } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { toast } from '@/shared/ui/toast-manager'

vi.mock('@/shared/ui/toast-manager', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))
vi.mock('@/modules/warehouse/hooks/use-scoped-warehouse-selector', () => ({
  useScopedWarehouseSelector: () => ({
    scopeReady: true,
    loadOptions: async () =>
      Object.values(createCrossModuleScenario().warehouses).map((warehouse) => ({
        value: warehouse.warehouseId,
        label: warehouse.nameAr,
        payload: warehouse,
      })),
  }),
}))

const scenario = createCrossModuleScenario()
const asset = scenario.assets.available
const warehouse = scenario.warehouses.source
const manager = ['document.view', 'document.create', 'document.post']

function renderForm(permissions = manager) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, createSession({ permissionCodes: permissions }))
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/adjustments/disposal/new']}>
        <Routes>
          <Route path="/adjustments/disposal/new" element={<AssetDisposalFormPage />} />
          <Route path="/adjustments" element={<p>تم حفظ المسودة</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

function eligibleHandler() {
  server.use(
    http.get('*/api/v1/adjustments/disposal-eligible-assets', () =>
      HttpResponse.json(createPage([asset])),
    ),
  )
}

async function chooseWarehouse(user: ReturnType<typeof userEvent.setup>, name = warehouse.nameAr) {
  const input = screen.getByRole('combobox', { name: 'مستودع الإعدام' })
  await user.clear(input)
  await user.type(input, name)
  await user.click(await screen.findByRole('option', { name }))
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await chooseWarehouse(user)
  const input = screen.getByRole('combobox', { name: 'الأصل المستبعد' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.type(input, asset.assetNumber)
  await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))
  await user.type(screen.getByLabelText('سبب الإعدام ومرجع المحضر'), 'محضر لجنة الفحص رقم ١٢')
}

describe('asset disposal draft contract', () => {
  it('denies a keeper with document.create and does not load eligible assets', () => {
    const lookup = vi.fn()
    server.use(http.get('*/api/v1/adjustments/disposal-eligible-assets', lookup))
    renderForm(['document.view', 'document.create'])
    expect(screen.getByRole('alert')).toHaveTextContent('حصرية لمديري المستودعات')
    expect(screen.queryByRole('button', { name: 'حفظ مسودة الإعدام' })).not.toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('requires actual selections and a reason, not free-text identities', async () => {
    eligibleHandler()
    const create = vi.fn()
    server.use(http.post('*/api/v1/adjustments', create))
    const user = renderForm()
    await chooseWarehouse(user)
    const input = screen.getByRole('combobox', { name: 'الأصل المستبعد' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, asset.assetId)
    await user.click(screen.getByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('سبب الإعدام مطلوب.')).toBeInTheDocument()
    expect(screen.getByText('يجب اختيار أصل صالح من القائمة.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the selected material separately from the asset and blocks duplicate submits while pending', async () => {
    eligibleHandler()
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/v1/adjustments', async ({ request }) => {
        bodies.push(await request.json())
        await pending
        return HttpResponse.json(
          { ...scenario.adjustments.disposal, status: 'Draft' },
          { status: 201 },
        )
      }),
    )
    const user = renderForm()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ مسودة الإعدام' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      warehouseId: warehouse.warehouseId,
      purpose: 'Disposal',
      reason: 'محضر لجنة الفحص رقم ١٢',
      lines: [
        {
          materialId: asset.material.id,
          assetId: asset.assetId,
          quantityDelta: -1,
          reason: 'محضر لجنة الفحص رقم ١٢',
        },
      ],
      rowVersion: 0,
    })
    expect(asset.assetId).not.toBe(asset.material.id)
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ...' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'مستودع الإعدام' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('button', { name: 'جارٍ الحفظ...' }).closest('form')!)
    expect(bodies).toHaveLength(1)
    release()
    expect(await screen.findByText('تم حفظ المسودة')).toBeInTheDocument()
  })

  it('clears the asset and material when the warehouse changes', async () => {
    eligibleHandler()
    const create = vi.fn()
    server.use(http.post('*/api/v1/adjustments', create))
    const user = renderForm()
    await fillForm(user)
    await chooseWarehouse(user, scenario.warehouses.destination.nameAr)
    expect(screen.getByRole('combobox', { name: 'الأصل المستبعد' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('يجب اختيار أصل صالح من القائمة.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends warehouse-scoped server search so an asset beyond the first 50 remains selectable', async () => {
    const requests: Array<Record<string, string | null>> = []
    server.use(
      http.get('*/api/v1/adjustments/disposal-eligible-assets', ({ request }) => {
        const params = new URL(request.url).searchParams
        requests.push({
          pageIndex: params.get('pageIndex'),
          pageSize: params.get('pageSize'),
          search: params.get('search'),
          warehouseId: params.get('warehouseId'),
        })
        // This asset represents a match outside the unfiltered first 50. The
        // contract search projects it back onto the selector's first page.
        return HttpResponse.json(
          createPage(params.get('search') === asset.assetNumber ? [asset] : [], {
            pageIndex: 0,
            pageSize: 10,
          }),
        )
      }),
    )
    const user = renderForm()
    await chooseWarehouse(user)

    const input = screen.getByRole('combobox', { name: 'الأصل المستبعد' })
    await user.type(input, asset.assetNumber)
    await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))

    expect(requests).toContainEqual({
      pageIndex: '0',
      pageSize: '10',
      search: asset.assetNumber,
      warehouseId: warehouse.warehouseId,
    })
    expect(input).toHaveValue(`${asset.assetNumber} — ${asset.material.displayName}`)
  })

  it('shows an Arabic lookup error and recovers on the next search', async () => {
    server.use(
      http.get(
        '*/api/v1/adjustments/disposal-eligible-assets',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    const user = renderForm()
    await chooseWarehouse(user)
    const input = screen.getByRole('combobox', { name: 'الأصل المستبعد' })
    await user.type(input, asset.assetNumber)
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر البحث في الأصول المؤهلة')
    expect(screen.queryByText('لا توجد أصول مؤهلة مطابقة في هذا المستودع.')).not.toBeInTheDocument()
    eligibleHandler()
    await user.type(input, ' 1')
    expect(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) })).toBeVisible()
  })

  it('retains the draft and allows retry after a create failure', async () => {
    eligibleHandler()
    server.use(http.post('*/api/v1/adjustments', () => new HttpResponse(null, { status: 500 })))
    const user = renderForm()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر حفظ مسودة الإعدام')
    expect(toast.error).toHaveBeenCalledWith({
      title: 'تعذر إتمام العملية حالياً.',
      description: 'حاول مجدداً بعد قليل، أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
    })
    expect(screen.getByLabelText('سبب الإعدام ومرجع المحضر')).toHaveValue('محضر لجنة الفحص رقم ١٢')
    expect(screen.getByRole('combobox', { name: 'الأصل المستبعد' })).toHaveValue(
      `${asset.assetNumber} — ${asset.material.displayName}`,
    )
    expect(screen.getByRole('button', { name: 'حفظ مسودة الإعدام' })).toBeEnabled()
  })
})
