import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import TransferDocumentFormPage from './transfer-document-form-page'
import {
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseDocument,
} from '@/test/msw/factories'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const SOURCE_WAREHOUSE_ID = '55555555-5555-4555-8555-555555555501'
const DESTINATION_WAREHOUSE_ID = '66666666-6666-4666-8666-666666666602'
const MATERIAL_ID = '77777777-7777-4777-8777-777777777703'
const MATERIAL_DOMAIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
const RETURN_DOC_ID = '88888888-8888-4888-8888-888888888804'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'أمين المستودع' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

const sourceWarehouse = createWarehouse({
  id: SOURCE_WAREHOUSE_ID,
  name: 'المستودع المركزي',
})
const destinationWarehouse = createWarehouse({
  id: DESTINATION_WAREHOUSE_ID,
  name: 'مستودع الفرع الشمالي',
})
/**
 * Material in the REAL catalog wire shape — `wireMaterial` mints
 * `catalog.api-types.Material`, which is what `GET /catalog/materials` serves
 * and what the line editor's payload derivation reads: the flat
 * `materialDomainId` / `baseUnitId` / `baseUnitSymbol` pairs and the identifier
 * `id`. The retired local projection off `createMaterial()` minted `materialId`
 * plus nested `domain` / `unit` / `rowVersion` fields, so the picker's option
 * value never matched the id the response carried and no material could be
 * selected.
 */
const material = wireMaterial({
  id: MATERIAL_ID,
  materialDomainId: MATERIAL_DOMAIN_ID,
})

/**
 * The shared quantity-line editor resolves an alternative unit's label from the
 * units-of-measure list, so the handler must exist once a material is picked.
 * The list is empty here because this suite carries no conversions.
 */
function unitsOfMeasureHandler() {
  return http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([]))
}

let postedBody: Record<string, unknown> | undefined
let paperReferenceBody: Record<string, unknown> | undefined

function useHandlers(balanceQuantity = 100) {
  postedBody = undefined
  paperReferenceBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      okPageJson([sourceWarehouse, destinationWarehouse]),
    ),
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      okJson([
        createWarehouseCapability({
          warehouseId: SOURCE_WAREHOUSE_ID,
          // The capability's domain reference must name the material's own
          // `materialDomainId` — the flat pair the line editor reads.
          materialDomainId: MATERIAL_DOMAIN_ID,
          materialDomainName: 'تقنية المعلومات',
          materialDomainCode: 'TEST',
          operations: ['Transfer'],
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
    unitsOfMeasureHandler(),
    http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
      const url = new URL(request.url)
      const materialId = url.searchParams.get('materialId')
      if (materialId === MATERIAL_ID) {
        return okPageJson([
          {
            warehouseId: SOURCE_WAREHOUSE_ID,
            materialId: MATERIAL_ID,
            quantity: balanceQuantity,
            unitOfMeasureId: fixtureUomId(),
          },
        ])
      }
      return okPageJson([])
    }),
    // A form with lines to save must use `complete-draft`: it is the only write
    // that creates a document together with its lines, and it answers the whole
    // detail read. The bare `POST /warehouse-documents` creates an EMPTY document
    // and answers `201 { id }`, which is why stubbing it left this journey on the
    // form.
    http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return okJson(
        wireDocumentDetails(
          createWarehouseDocument({
            documentId: RETURN_DOC_ID,
            documentType: 'Transfer',
            documentStatus: 'Draft',
            systemReferenceNumber: 'EIAMS-TRF-2026-0001',
          }),
        ),
      )
    }),
    // The paper number/year are NOT part of the draft command; they live on
    // their own route, so the form writes them in a second call after the
    // document exists.
    http.put(
      `${API_BASE_URL}/warehouse-documents/${RETURN_DOC_ID}/paper-reference`,
      async ({ request }) => {
        paperReferenceBody = (await request.json()) as Record<string, unknown>
        return okJson({})
      },
    ),
  )
}

function fixtureUomId(): string {
  return '99999999-9999-4999-8999-999999999901'
}

async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'مركزي')
  const whOptions = await screen.findAllByRole('option')
  const whTarget = whOptions.find((o) => (o.textContent ?? '').includes('المستودع المركزي'))
  expect(whTarget).toBeDefined()
  if (whTarget) await user.click(whTarget)

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2026/000042')
  await user.type(screen.getByLabelText('السنة الورقية'), '2026')
}

async function fillPetal(user: ReturnType<typeof userEvent.setup>) {
  // Destination picker is the second combobox (inside the petal fieldset).
  const destinationCombo = screen.getByLabelText('مستودع الوجهة')
  await user.click(destinationCombo)
  await user.type(destinationCombo, 'شمالي')
  const destOptions = await screen.findAllByRole('option')
  const destTarget = destOptions.find((o) => (o.textContent ?? '').includes('مستودع الفرع الشمالي'))
  expect(destTarget).toBeDefined()
  if (destTarget) await user.click(destTarget)

  await user.type(screen.getByLabelText('سبب التحويل'), 'تغطية احتياج الفرع الشمالي')
}

async function fillLine(user: ReturnType<typeof userEvent.setup>) {
  const materialInput = [...document.querySelectorAll('form input')].find(
    (input) => input instanceof HTMLInputElement && input.placeholder === 'ابحث عن مادة...',
  )
  if (!(materialInput instanceof HTMLInputElement)) throw new Error('material input not found')
  await user.click(materialInput)
  await user.type(materialInput, 'pc')
  const matOptions = await screen.findAllByRole('option')
  const matTarget = matOptions.find((o) => (o.textContent ?? '').includes(material.nameAr))
  expect(matTarget).toBeDefined()
  if (matTarget) await user.click(matTarget)
  await user.type(screen.getByLabelText('الكمية'), '10')
}

function renderPage(permissionCodes: readonly string[] = ['document.view', 'document.create']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/documents/transfer/new']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/documents/transfer/new" element={<TransferDocumentFormPage />} />
          <Route
            path="/documents/transfer/:documentId"
            element={<span data-testid="detail-stub">DETAIL-LANDING</span>}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('TransferDocumentFormPage (e17-t04/t05/t06)', () => {
  it('renders the spine, destination petal, and lines editor with Arabic labels', async () => {
    useHandlers()
    renderPage()

    expect(await screen.findByText('سند تحويل جديد')).toBeInTheDocument()
    expect(screen.getByLabelText('مستودع الوجهة')).toBeInTheDocument()
    expect(screen.getByLabelText('سبب التحويل')).toBeInTheDocument()
    expect(screen.getByText('بنود التحويل')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeInTheDocument()
  }, 20000)

  // eiams-frontend-61zf. The transfer reason textarea carried no `id`, so the
  // shared `FormLabel` pointed its `for` at an element that did not exist and
  // the browser logged «Incorrect use of <label for=FORM_ELEMENT>».
  it('points every label at a control that exists', async () => {
    useHandlers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderPage()

    await screen.findByText('سند تحويل جديد')

    const orphanLabels = Array.from(document.querySelectorAll<HTMLLabelElement>('label[for]'))
      .filter((label) => document.getElementById(label.htmlFor) === null)
      .map((label) => label.textContent)
    expect(orphanLabels).toEqual([])

    // The reason field is named by the label that points at it.
    const reason = screen.getByLabelText('سبب التحويل')
    const reasonLabel = Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find(
      (label) => label.textContent === 'سبب التحويل',
    )
    expect(reasonLabel?.htmlFor).toBe(reason.id)
    expect(reason.id).not.toBe('')
    expect(consoleError).not.toHaveBeenCalled()
  }, 20000)

  it('blocks submission when a line quantity exceeds the source balance', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند تحويل جديد')
    await fillHeader(user)
    await fillLine(user)
    // Balance seeded at 100; type an over-balance amount.
    const quantity = screen.getByLabelText('الكمية')
    await user.clear(quantity)
    await user.type(quantity, '150')

    expect(await screen.findByText(/تتجاوز الرصيد المتاح في المستودع المصدر/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()
    expect(postedBody).toBeUndefined()
  }, 30000)

  // eiams-frontend-7eqp. The form-level over-balance alert and the shared
  // per-line hint sit on ONE screen and state the SAME balance, so they must
  // render the SAME glyphs. Arabic-Indic digits are the app-wide policy
  // (`formatNumber`); the alert used to interpolate the raw number, so the
  // user could not tell the two renderings apart.
  it('renders the over-balance alert and the per-line hint in the same Arabic-Indic digits', async () => {
    useHandlers(3)
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند تحويل جديد')
    await fillHeader(user)
    await fillLine(user)
    const quantity = screen.getByLabelText('الكمية')
    await user.clear(quantity)
    await user.type(quantity, '5')

    const alert = await screen.findByText(
      /^الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح في المستودع المصدر/,
    )
    // The balance (3) reads ٣ in the alert, and never as the Latin "3".
    expect(alert).toHaveTextContent('(٣)')
    expect(alert).not.toHaveTextContent('3')

    const perLineHint = await screen.findByText(/^الكمية المطلوبة تتجاوز الرصيد المتاح/)
    expect(perLineHint).toHaveTextContent('(٣)')
    expect(perLineHint).not.toHaveTextContent('3')
  }, 30000)

  it('posts a contract-shaped Transfer draft and navigates to the detail route', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند تحويل جديد')
    await fillHeader(user)
    await fillPetal(user)
    await fillLine(user)

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
    await waitFor(
      () => {
        expect(screen.getByTestId('detail-stub')).toBeInTheDocument()
      },
      { timeout: 8000 },
    )

    expect(postedBody?.['documentType']).toBe('Transfer')
    const transferInfo = postedBody?.['transferInfo'] as Record<string, unknown>
    expect(transferInfo['destinationWarehouseId']).toBe(DESTINATION_WAREHOUSE_ID)
    expect(transferInfo['transferReason']).toBe('تغطية احتياج الفرع الشمالي')
    // The live petal is an id and a reason: the server never accepted a
    // destination display name on the write.
    expect(transferInfo['destinationWarehouseName']).toBeUndefined()
    // The paper reference is not part of the draft command: it is written on its
    // own route, guarded on the version the user was shown.
    expect(paperReferenceBody).toEqual({
      expectedRowVersion: 1,
      paperDocumentNumber: '2026/000042',
      paperDocumentYear: 2026,
    })
  }, 40000)

  // e24-t10 / B3. A failed per-line balance read used to be mapped to "no stock
  // held" (null), so the form printed a factually false statement about
  // inventory — "الكمية المطلوبة … تتجاوز الرصيد المتاح في المستودع المصدر (0)"
  // — with no error and no retry. It must instead say the read failed, block
  // Save, and recover into the real over-balance check once the read succeeds.
  it('reports a failed balance read honestly, blocks Save, and recovers on retry', async () => {
    useHandlers()
    let balanceShouldFail = true
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        balanceShouldFail ? new HttpResponse(null, { status: 500 }) : okPageJson([]),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند تحويل جديد')
    await fillHeader(user)
    await fillLine(user)
    // Deliberately over the seeded 100 balance, so a successful read below must
    // produce the genuine over-balance block.
    const quantity = screen.getByLabelText('الكمية')
    await user.clear(quantity)
    await user.type(quantity, '150')

    const failure = await screen.findByTestId('balance-read-error')
    expect(failure).toHaveAttribute('role', 'alert')
    expect(failure).toHaveTextContent('تعذّر جلب الأرصدة المتاحة. أعد المحاولة قبل الحفظ.')
    // The false claim about inventory is gone.
    expect(screen.queryByText(/تتجاوز الرصيد المتاح/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('الرصيد المتاح في المستودع المصدر (0)')
    // Fail CLOSED: an unverified balance never reaches persistence.
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()
    expect(postedBody).toBeUndefined()

    // Retrying re-reads the balances; the recovered read then produces the
    // REAL block for the same line (AGENTS.md rule 3 is not weakened).
    balanceShouldFail = false
    await user.click(within(failure).getByRole('button', { name: 'إعادة المحاولة' }))

    expect(await screen.findByText(/تتجاوز الرصيد المتاح في المستودع المصدر/)).toBeInTheDocument()
    expect(screen.queryByTestId('balance-read-error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()
    expect(postedBody).toBeUndefined()
  }, 40000)
})
