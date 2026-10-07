import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import TransferDocumentFormPage from './transfer-document-form-page'
import type { Material } from '@/modules/catalog/types/catalog.api-types'
import {
  createMaterial,
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouse,
  createWarehouseCapability,
} from '@/test/msw/factories'
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
const DESTINATION_WAREHOUSE_ID = '66666666-6666-4666-8666-666666666602'
const MATERIAL_ID = '77777777-7777-4777-8777-777777777703'
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
const material = contractMaterial({ materialId: MATERIAL_ID })

/**
 * Re-projects the shared `createMaterial()` fixture onto the HANDWRITTEN catalog
 * contract the production line editor parses.
 *
 * `createMaterial()` still mints the frozen generated shape (`domain` / `family` /
 * `baseUnit`); `catalog/api-types` `Material` carries `materialDomain` /
 * `materialFamily` / `unit`. Without the projection
 * `quantity-line-editor.tsx` dereferences `payload.materialDomain.id` on
 * `undefined` and every material pick throws.
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

let postedBody: Record<string, unknown> | undefined

function useHandlers() {
  postedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      okPageJson([sourceWarehouse, destinationWarehouse]),
    ),
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      okJson([
        createWarehouseCapability({
          warehouseId: SOURCE_WAREHOUSE_ID,
          domain: material.materialDomain,
          operations: ['Transfer'],
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
      const url = new URL(request.url)
      const materialId = url.searchParams.get('materialId')
      if (materialId === MATERIAL_ID) {
        return okPageJson([
          {
            warehouseId: SOURCE_WAREHOUSE_ID,
            materialId: MATERIAL_ID,
            quantity: 100,
            unitOfMeasureId: fixtureUomId(),
          },
        ])
      }
      return okPageJson([])
    }),
    http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return apiJson(
        {
          documentId: RETURN_DOC_ID,
          documentNumber: 'TRF-2026-0001',
          documentType: 'Transfer',
          documentStatus: 'Draft',
          systemReferenceNumber: 'EIAMS-TRF-2026-0001',
        },
        { status: 201 },
      )
    }),
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
    expect(transferInfo['destinationWarehouseName']).toBe('مستودع الفرع الشمالي')
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
