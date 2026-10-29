import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'

import IssueDocumentFormPage from './issue-document-form-page'
import {
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouse,
  createWarehouseCapability,
} from '@/test/msw/factories'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { apiJson, okJson, okPageJson } from '@/test/msw/envelope'
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
const MATERIAL_ID = '77777777-7777-4777-8777-777777777703'
const MATERIAL_DOMAIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
const UNIT_OF_MEASURE_ID = '99999999-9999-4999-8999-999999999901'
const ISSUE_DOCUMENT_ID = '44444444-4444-4444-8444-444444444704'

const sourceWarehouse = createWarehouse({
  id: SOURCE_WAREHOUSE_ID,
  name: 'المستودع المركزي',
})

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'أمين المستودع' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

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
  baseUnitSymbol: 'قطعة',
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

function useHandlers(balanceQuantity: number | 'fail') {
  postedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([sourceWarehouse])),
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
    http.get(`${API_BASE_URL}/assets`, () => okPageJson([])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      okJson([
        createWarehouseCapability({
          warehouseId: SOURCE_WAREHOUSE_ID,
          // The capability's domain reference must name the material's own
          // `materialDomainId` — the flat pair the line editor reads.
          materialDomainId: MATERIAL_DOMAIN_ID,
          materialDomainName: 'تقنية المعلومات',
          materialDomainCode: 'TEST',
          operations: ['Issue'],
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
    unitsOfMeasureHandler(),
    http.get(`${API_BASE_URL}/inventory/balances`, () =>
      balanceQuantity === 'fail'
        ? new HttpResponse(null, { status: 500 })
        : okPageJson([
            {
              warehouseId: SOURCE_WAREHOUSE_ID,
              materialId: MATERIAL_ID,
              quantity: balanceQuantity,
              unitOfMeasureId: UNIT_OF_MEASURE_ID,
            },
          ]),
    ),
    http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return apiJson(
        {
          documentId: ISSUE_DOCUMENT_ID,
          documentNumber: 'ISS-2026-0001',
          documentType: 'Issue',
          documentStatus: 'Draft',
          systemReferenceNumber: 'EIAMS-ISS-2026-0001',
        },
        { status: 201 },
      )
    }),
  )
}

async function chooseSourceWarehouse(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'مركزي')
  const options = await screen.findAllByRole('option')
  const target = options.find((option) => (option.textContent ?? '').includes('المستودع المركزي'))
  expect(target).toBeDefined()
  if (target) await user.click(target)
  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2026/000042')
  await user.type(screen.getByLabelText('السنة الورقية'), '2026')
}

async function chooseMaterial(user: ReturnType<typeof userEvent.setup>) {
  const materialInput = [...document.querySelectorAll('form input')].find(
    (input) => input instanceof HTMLInputElement && input.placeholder === 'ابحث عن مادة...',
  )
  if (!(materialInput instanceof HTMLInputElement)) throw new Error('material input not found')
  await user.click(materialInput)
  await user.type(materialInput, 'pc')
  const options = await screen.findAllByRole('option')
  const target = options.find((option) => (option.textContent ?? '').includes(material.nameAr))
  expect(target).toBeDefined()
  if (target) await user.click(target)
}

function renderPage(permissionCodes: readonly string[] = ['document.view', 'document.create']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/documents/issue/new']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/documents/issue/new" element={<IssueDocumentFormPage />} />
          <Route
            path="/documents/issue/:documentId"
            element={<span data-testid="detail-stub">DETAIL-LANDING</span>}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('IssueDocumentFormPage', () => {
  it('renders the Arabic page title, spine header, recipient section, and line editor', async () => {
    render(<IssueDocumentFormPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'سند صرف جديد' })).toBeInTheDocument()
    expect(screen.getByLabelText('المستودع')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'الجهة المستلمة' })).toBeInTheDocument()
    expect(screen.getByLabelText('سبب الصرف')).toBeInTheDocument()
    expect(screen.getAllByLabelText('المادة').length).toBeGreaterThan(0)
  })

  it('keeps the save button enabled while no line is over its (unknown) balance', async () => {
    render(<IssueDocumentFormPage />, { wrapper: createWrapper() })

    // With an empty material selection there is nothing to over-draw, so the
    // submit stays enabled and no balance alert renders.
    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
    expect(document.querySelector('[role=alert][class*="text-destructive"]')).toBeNull()
  })

  // eiams-frontend-7eqp. The form-level over-balance alert and the shared
  // per-line hint sit on ONE screen and state the SAME balance, so they must
  // render the SAME glyphs. Arabic-Indic digits are the app-wide policy
  // (`formatNumber`); the alert used to interpolate the raw number, so the
  // user could not tell the two renderings apart.
  it('renders the over-balance alert and the per-line hint in the same Arabic-Indic digits', async () => {
    useHandlers(3)
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند صرف جديد')
    await chooseSourceWarehouse(user)
    await chooseMaterial(user)
    const quantity = screen.getByLabelText('الكمية')
    await user.clear(quantity)
    await user.type(quantity, '5')

    const alert = await screen.findByText(/^الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح/)
    // The balance (3) reads ٣ in the alert, and never as the Latin "3".
    expect(alert).toHaveTextContent('(٣)')
    expect(alert).not.toHaveTextContent('3')

    const perLineHint = await screen.findByText(/^الكمية المطلوبة تتجاوز الرصيد المتاح/)
    expect(perLineHint).toHaveTextContent('(٣)')
    expect(perLineHint).not.toHaveTextContent('3')
  }, 40000)

  // eiams-frontend-dtvi / rzt3. Base UI's combobox popup is a MODAL focus
  // manager: opening it marks the rest of the document aria-hidden. When the
  // results arrive after the user has already moved on to another field, the
  // browser refuses to hide the focused element and logs «Blocked aria-hidden
  // on an element because its descendant retained focus». The panel must not
  // open behind the user's back, and the focused field must never end up
  // inside an aria-hidden subtree.
  it('never leaves the focused field inside an aria-hidden subtree when the material results arrive late', async () => {
    useHandlers(100)
    let materialReads = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => {
        materialReads += 1
        return okPageJson([material])
      }),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند صرف جديد')
    const materialInput = [...document.querySelectorAll('form input')].find(
      (input) => input instanceof HTMLInputElement && input.placeholder === 'ابحث عن مادة...',
    )
    if (!(materialInput instanceof HTMLInputElement)) throw new Error('material input not found')
    await user.click(materialInput)
    await user.type(materialInput, 'pc')
    // The user moves to the reason field BEFORE the results arrive.
    const reason = screen.getByLabelText('سبب الصرف')
    await user.click(reason)
    await waitFor(() => expect(document.activeElement).toBe(reason))

    // The results land now, with the focus sitting in the reason field.
    await waitFor(() => expect(materialReads).toBeGreaterThan(0))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(reason.closest('[aria-hidden="true"]')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  }, 40000)

  // e24-t10 / B3. A failed per-line balance read used to become "no stock held"
  // (null), so the form printed a factually false statement about inventory —
  // "الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح (0)" — with no error and
  // no retry. It must instead report the failed read, block Save, and recover
  // into the real over-balance check once the read succeeds.
  it('reports a failed balance read honestly, blocks Save, and recovers on retry', async () => {
    useHandlers('fail')
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند صرف جديد')
    await chooseSourceWarehouse(user)
    await chooseMaterial(user)
    const quantity = screen.getByLabelText('الكمية')
    await user.clear(quantity)
    // Deliberately over the balance seeded below, so a successful read must
    // produce the genuine over-balance block.
    await user.type(quantity, '150')

    const failure = await screen.findByTestId('balance-read-error')
    expect(failure).toHaveAttribute('role', 'alert')
    expect(failure).toHaveTextContent('تعذّر جلب الأرصدة المتاحة. أعد المحاولة قبل الحفظ.')
    // The false claim about inventory is gone.
    expect(screen.queryByText(/تتجاوز الرصيد المتاح/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('الرصيد المتاح (0)')
    // Fail CLOSED: an unverified balance never reaches persistence.
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()
    expect(postedBody).toBeUndefined()

    // Retrying re-reads the balances; the recovered read then produces the
    // REAL block for the same line (AGENTS.md rule 3 is not weakened).
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        okPageJson([
          {
            warehouseId: SOURCE_WAREHOUSE_ID,
            materialId: MATERIAL_ID,
            quantity: 100,
            unitOfMeasureId: UNIT_OF_MEASURE_ID,
          },
        ]),
      ),
    )
    await user.click(within(failure).getByRole('button', { name: 'إعادة المحاولة' }))

    expect(
      await screen.findByText(/^الكمية المطلوبة في البند 1 تتجاوز الرصيد المتاح \(١٠٠\)/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('balance-read-error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()
    expect(postedBody).toBeUndefined()
  }, 40000)
})

/** Lightweight wrapper for the two original render-only cases. */
function createWrapper() {
  const client = createQueryClient()
  return function PageWrapper({ children }: React.PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}
