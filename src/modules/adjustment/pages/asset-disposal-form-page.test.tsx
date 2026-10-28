import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, fireEvent, getConfig, render, screen, waitFor } from '@testing-library/react'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ASSET_STATUS_LABELS_AR } from '@/modules/asset/asset-status-labels'
import AssetDisposalFormPage from '@/modules/adjustment/pages/asset-disposal-form-page'
import type { DisposalEligibleAsset } from '@/modules/adjustment/types/adjustment.types'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { createSession, createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
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
        value: warehouse.id,
        label: warehouse.name,
        payload: warehouse,
      })),
  }),
}))

const scenario = createCrossModuleScenario()
const warehouse = scenario.warehouses.source
const manager = ['document.view', 'document.create', 'document.post']

/**
 * One row of the LIVE picker endpoint
 * (`GET /api/v1/adjustments/disposal-eligible-assets`): flat, camelCase, with
 * the item's own `id` AS the asset id. There is no `material` object, no
 * `currentWarehouse` and no `derivedStatus` — the status field is
 * `currentStatus`.
 */
const asset: DisposalEligibleAsset = {
  id: fixtureUuid(950),
  assetNumber: 'AST-2026-1003',
  serialNumber: 'SN-889900',
  materialId: fixtureUuid(906),
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  warehouseId: warehouse.id,
  warehouseCode: warehouse.code,
  warehouseName: warehouse.name,
  currentStatus: 'InStock',
  rowVersion: 1,
}

/** The picker label carries the status: it is what decides the server's effect. */
const assetLabel = `${asset.assetNumber} — ${asset.materialNameAr} — ${ASSET_STATUS_LABELS_AR.InStock}`

const REASON = 'محضر لجنة الفحص رقم ١٢'

/** The draft the LIVE disposal endpoint answers with. */
const DISPOSAL_ID = fixtureUuid(951)

/** The authorisation reference the form collects and the draft must carry. */
const PAPER_DOCUMENT_NUMBER = '2026/000123'
const PAPER_DOCUMENT_YEAR = 2026

/** The version the shared document detail read issues for that draft. */
const DRAFT_ROW_VERSION = 7

/**
 * The shared document engine's own routes for the created draft: the detail
 * read that carries the row version the paper write is guarded on, and the
 * paper-reference write itself.
 *
 * The disposal endpoint binds no paper field, so the reference travels through
 * `PUT /warehouse-documents/{id}/paper-reference` — the same route every other
 * document form uses.
 */
function draftDocumentHandlers(captured: { paperReferenceBodies: unknown[] }) {
  server.use(
    http.get(`*/api/v1/warehouse-documents/${DISPOSAL_ID}`, () =>
      okJson(
        wireDocumentDetails(
          createWarehouseDocument({
            documentId: DISPOSAL_ID,
            documentType: 'Adjustment',
            rowVersion: DRAFT_ROW_VERSION,
          }),
        ),
      ),
    ),
    http.put(`*/api/v1/warehouse-documents/${DISPOSAL_ID}/paper-reference`, async ({ request }) => {
      captured.paperReferenceBodies.push(await request.json())
      return apiJson(null, { status: 200 })
    }),
  )
}

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
  server.use(http.get('*/api/v1/adjustments/disposal-eligible-assets', () => okPageJson([asset])))
}

async function chooseWarehouse(user: ReturnType<typeof userEvent.setup>, name = warehouse.name) {
  const input = await screen.findByRole('combobox', { name: 'مستودع الإعدام' })
  await user.clear(input)
  await user.type(input, name)
  await user.click(await screen.findByRole('option', { name }))
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await chooseWarehouse(user)
  const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.type(input, asset.assetNumber)
  await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))
  await user.type(screen.getByLabelText('سبب الإعدام ومرجع المحضر'), REASON)
  await user.type(screen.getByLabelText('رقم المستند الورقي'), PAPER_DOCUMENT_NUMBER)
  await user.type(screen.getByLabelText('السنة الورقية'), String(PAPER_DOCUMENT_YEAR))
}

/**
 * WHY THIS SUITE CARRIES ITS OWN BUDGETS
 * --------------------------------------
 *
 * This suite drives a real integration chain — the shared 300 ms search
 * debounce (`useDebounce`), the MSW-intercepted round trip, and the React /
 * Base-UI re-render that publishes the result — and it types up to 201
 * characters, each keystroke re-rendering the form and re-running its zod
 * validation. Under the full parallel run (300+ files, 15 workers on 16
 * logical CPUs) every step of that chain is served late. TWO DIFFERENT budgets
 * are exhausted, and which one trips first differs from run to run on an
 * unchanged tree:
 *
 *  - RTL's per-assertion budget (DEFAULT 1000 ms). Measured under 30-way CPU
 *    contention: "Unable to find role=\"option\" and name \"المستودع المركزي في
 *    دمشق\"" — the debounced search had not published its option yet.
 *  - the per-TEST budget. Measured under the same load: "Test timed out in
 *    20000ms" on the 200-character reason test, whose body is those 201
 *    keystrokes. Vitest's own `testTimeout` (20 s, `vite.config.ts`) IS this
 *    budget, and the bead's own evidence — the whole suite is green under
 *    `--testTimeout=25000` — proves it is the dominant one, because a Vitest
 *    timeout cannot cure an RTL assertion timeout.
 *
 * A third mechanism is not a budget at all: Base UI's combobox popup is a
 * modal focus manager, so while it is open — or while its teardown is still
 * pending — the rest of the document is `aria-hidden`, and RTL's role queries
 * ignore aria-hidden subtrees. A synchronous `getByRole` landing in that window
 * fails with "Unable to find an accessible element with the role ..." about an
 * element that IS in the DOM. The queries below therefore WAIT for the element
 * (`findByRole`) instead of demanding it synchronously.
 *
 * The budgets are scoped to THIS SUITE: the RTL async-assertion budget is
 * raised for these tests only (and restored afterwards), and the suite carries
 * its own test timeout. No global override is added and no assertion is
 * relaxed — a wrong element still fails, it just fails after the real round
 * trip has had time to land.
 */
const ASYNC_ASSERTION_TIMEOUT = 8_000

/** The suite's own test timeout, so a slow round trip is not a test timeout. */
const SUITE_TIMEOUT = 30_000

describe('asset disposal draft contract', { timeout: SUITE_TIMEOUT }, () => {
  const defaultAsyncUtilTimeout = getConfig().asyncUtilTimeout
  beforeAll(() => configure({ asyncUtilTimeout: ASYNC_ASSERTION_TIMEOUT }))
  afterAll(() => configure({ asyncUtilTimeout: defaultAsyncUtilTimeout }))

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
    server.use(http.post('*/api/v1/adjustments/disposals', create))
    const user = renderForm()
    await chooseWarehouse(user)
    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, asset.id)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('سبب الإعدام مطلوب.')).toBeInTheDocument()
    expect(screen.getByText('يجب اختيار أصل صالح من القائمة.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('requires the paper reference before a disposal draft can be saved', async () => {
    eligibleHandler()
    const create = vi.fn()
    server.use(http.post('*/api/v1/adjustments/disposals', create))
    const user = renderForm()
    await chooseWarehouse(user)
    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, asset.assetNumber)
    await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))
    await user.type(screen.getByLabelText('سبب الإعدام ومرجع المحضر'), REASON)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    // The shared document vocabulary, not a second one: a disposal without its
    // authorisation reference never reaches the server.
    expect(await screen.findByText('رقم المستند الورقي مطلوب.')).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال سنة صحيحة.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the LIVE disposal body and nothing else, and blocks duplicate submits while pending', async () => {
    eligibleHandler()
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: unknown[] = []
    const paperReferenceBodies: unknown[] = []
    server.use(
      http.post('*/api/v1/adjustments/disposals', async ({ request }) => {
        bodies.push(await request.json())
        await pending
        // 201 `{ id }` — the shared resource-id projection the endpoint answers.
        return apiJson({ id: DISPOSAL_ID }, { status: 201 })
      }),
    )
    draftDocumentHandlers({ paperReferenceBodies })
    const user = renderForm()
    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    // The LIVE disposal body: the warehouse, EXACTLY ONE asset id and the
    // reason. `toEqual` is exact, so this also proves the absence of every
    // field the old generic draft carried — `purpose`, `lines`,
    // `rowVersion`, `materialId`, `quantityDelta` — and of any effect the
    // client must never send: the server derives it. The paper reference is
    // NOT among them: the live endpoint binds no such field.
    expect(bodies[0]).toEqual({
      warehouseId: warehouse.id,
      assetIds: [asset.id],
      reason: REASON,
    })
    expect(await screen.findByRole('button', { name: 'جارٍ الحفظ...' })).toBeDisabled()
    expect(await screen.findByRole('combobox', { name: 'مستودع الإعدام' })).toBeDisabled()
    fireEvent.submit(
      (await screen.findByRole('button', { name: 'جارٍ الحفظ...' })).closest('form')!,
    )
    expect(bodies).toHaveLength(1)
    release()
    expect(await screen.findByText('تم حفظ المسودة')).toBeInTheDocument()
    expect(paperReferenceBodies).toEqual([
      {
        expectedRowVersion: DRAFT_ROW_VERSION,
        paperDocumentNumber: PAPER_DOCUMENT_NUMBER,
        paperDocumentYear: PAPER_DOCUMENT_YEAR,
      },
    ])
  })

  it('writes the paper reference on the created draft through the shared document route', async () => {
    eligibleHandler()
    const bodies: unknown[] = []
    const paperReferenceBodies: unknown[] = []
    server.use(
      http.post('*/api/v1/adjustments/disposals', async ({ request }) => {
        bodies.push(await request.json())
        return apiJson({ id: DISPOSAL_ID }, { status: 201 })
      }),
    )
    draftDocumentHandlers({ paperReferenceBodies })
    const user = renderForm()
    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('تم حفظ المسودة')).toBeInTheDocument()
    // The create body stays EXACTLY the live disposal body; the reference
    // travels through the shared engine's own route, guarded on the version
    // the server issued for the draft it just created.
    expect(bodies[0]).toEqual({
      warehouseId: warehouse.id,
      assetIds: [asset.id],
      reason: REASON,
    })
    expect(paperReferenceBodies).toEqual([
      {
        expectedRowVersion: DRAFT_ROW_VERSION,
        paperDocumentNumber: PAPER_DOCUMENT_NUMBER,
        paperDocumentYear: PAPER_DOCUMENT_YEAR,
      },
    ])
  })

  it('surfaces a failed paper-reference write instead of reporting a saved disposal', async () => {
    eligibleHandler()
    const paperReferenceBodies: unknown[] = []
    server.use(
      http.post('*/api/v1/adjustments/disposals', () =>
        apiJson({ id: DISPOSAL_ID }, { status: 201 }),
      ),
      http.get(`*/api/v1/warehouse-documents/${DISPOSAL_ID}`, () =>
        okJson(
          wireDocumentDetails(
            createWarehouseDocument({
              documentId: DISPOSAL_ID,
              documentType: 'Adjustment',
              rowVersion: DRAFT_ROW_VERSION,
            }),
          ),
        ),
      ),
      http.put(
        `*/api/v1/warehouse-documents/${DISPOSAL_ID}/paper-reference`,
        async ({ request }) => {
          paperReferenceBodies.push(await request.json())
          return new HttpResponse(null, { status: 500 })
        },
      ),
    )
    vi.mocked(toast.success).mockClear()
    const user = renderForm()
    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    // The draft EXISTS and its audit trail does not: the screen says exactly
    // that instead of claiming a complete disposal.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'أُنشئت مسودة الإعدام لكن تعذّر حفظ رقم المستند الورقي',
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.queryByText('تم حفظ المسودة')).not.toBeInTheDocument()
    expect(paperReferenceBodies).toHaveLength(1)
  })

  it('rejects a reason longer than the live endpoint accepts (200 characters)', async () => {
    eligibleHandler()
    const create = vi.fn()
    server.use(http.post('*/api/v1/adjustments/disposals', create))
    const user = renderForm()
    await chooseWarehouse(user)
    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, asset.assetNumber)
    await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))
    // The disposal validator caps the reason at 200; the sibling adjustment
    // draft allows 500, so this bound belongs to THIS screen.
    await user.type(screen.getByLabelText('سبب الإعدام ومرجع المحضر'), 'م'.repeat(201))
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('يجب ألا يتجاوز سبب الإعدام 200 محرفاً.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('clears the asset when the warehouse changes', async () => {
    eligibleHandler()
    const create = vi.fn()
    server.use(http.post('*/api/v1/adjustments/disposals', create))
    const user = renderForm()
    await fillForm(user)
    await chooseWarehouse(user, scenario.warehouses.destination.name)
    // The asset picker is REMOUNTED by the warehouse change (`key={warehouseId}`),
    // so the element under assertion is a NEW one that only lands on the next
    // commit: assert the settled state instead of demanding it synchronously.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'الأصل المستبعد' })).toHaveValue(''),
    )
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByText('يجب اختيار أصل صالح من القائمة.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('shows the asset status in the picker so the derived effect is visible', async () => {
    eligibleHandler()
    const user = renderForm()
    await chooseWarehouse(user)

    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await user.type(input, asset.assetNumber)
    const option = await screen.findByRole('option', { name: new RegExp(asset.assetNumber) })

    // The status travels with the option: `InStock` means the server will
    // apply −1, `Issued`/`InCustody` mean 0.
    expect(option).toHaveTextContent(ASSET_STATUS_LABELS_AR.InStock)
    expect(option).not.toHaveTextContent(ASSET_STATUS_LABELS_AR.Disposed)
  })

  it('sends warehouse-scoped server search so an asset beyond the first 50 remains selectable', async () => {
    const requests: Array<Record<string, string | null>> = []
    server.use(
      http.get('*/api/v1/adjustments/disposal-eligible-assets', ({ request }) => {
        const params = new URL(request.url).searchParams
        requests.push({
          page: params.get('page'),
          pageSize: params.get('pageSize'),
          search: params.get('search'),
          warehouseId: params.get('warehouseId'),
        })
        // This asset represents a match outside the unfiltered first 50. The
        // contract search projects it back onto the selector's first page.
        return okPageJson(params.get('search') === asset.assetNumber ? [asset] : [], {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        })
      }),
    )
    const user = renderForm()
    await chooseWarehouse(user)

    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await user.type(input, asset.assetNumber)
    await user.click(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) }))

    expect(requests).toContainEqual({
      page: '1',
      pageSize: '10',
      search: asset.assetNumber,
      warehouseId: warehouse.id,
    })
    expect(input).toHaveValue(assetLabel)
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
    const input = await screen.findByRole('combobox', { name: 'الأصل المستبعد' })
    await user.type(input, asset.assetNumber)
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر البحث في الأصول المؤهلة')
    expect(screen.queryByText('لا توجد أصول مؤهلة مطابقة في هذا المستودع.')).not.toBeInTheDocument()
    eligibleHandler()
    await user.type(input, ' 1')
    expect(await screen.findByRole('option', { name: new RegExp(asset.assetNumber) })).toBeVisible()
  })

  it('shows the server Arabic copy for the single-asset refusal instead of a generic message', async () => {
    eligibleHandler()
    server.use(
      http.post('*/api/v1/adjustments/disposals', () =>
        // 400 `DISPOSALS_SINGLE_ASSET_REQUIRED` — the server refuses a draft
        // that carries two assets.
        errJson(400, { code: 'DISPOSALS_SINGLE_ASSET_REQUIRED', details: { asset_count: 2 } }),
      ),
    )
    const user = renderForm()
    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'سند الإهلاك يتطلّب أصلاً واحداً بالضبط.',
    )
  })

  it('retains the draft and allows retry after a create failure', async () => {
    eligibleHandler()
    server.use(
      http.post('*/api/v1/adjustments/disposals', () => new HttpResponse(null, { status: 500 })),
    )
    const user = renderForm()
    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' }))
    // The server's own copy, not a generic "the draft could not be saved".
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر إتمام العملية حالياً.')
    expect(toast.error).toHaveBeenCalledWith({
      title: 'تعذر إتمام العملية حالياً.',
      description: 'حاول مجدداً بعد قليل، أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
    })
    expect(screen.getByLabelText('سبب الإعدام ومرجع المحضر')).toHaveValue(REASON)
    expect(await screen.findByRole('combobox', { name: 'الأصل المستبعد' })).toHaveValue(assetLabel)
    expect(await screen.findByRole('button', { name: 'حفظ مسودة الإعدام' })).toBeEnabled()
  })
})
