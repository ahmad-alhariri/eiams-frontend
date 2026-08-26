import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import TransferDocumentFormPage from './transfer-document-form-page'
import {
  createMaterial,
  createPage,
  createWarehouse,
  createWarehouseCapability,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

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
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.keeper',
      displayName: 'أمين المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const sourceWarehouse = createWarehouse({
  warehouseId: SOURCE_WAREHOUSE_ID,
  nameAr: 'المستودع المركزي',
})
const destinationWarehouse = createWarehouse({
  warehouseId: DESTINATION_WAREHOUSE_ID,
  nameAr: 'مستودع الفرع الشمالي',
})
const material = createMaterial({ materialId: MATERIAL_ID })

let postedBody: Record<string, unknown> | undefined

function useHandlers() {
  postedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(createPage([sourceWarehouse, destinationWarehouse])),
    ),
    http.get(`${API_BASE_URL}/catalog/materials`, () => HttpResponse.json(createPage([material]))),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      HttpResponse.json([
        createWarehouseCapability({
          warehouseId: SOURCE_WAREHOUSE_ID,
          domain: material.domain,
          operations: ['Transfer'],
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
      const url = new URL(request.url)
      const materialId = url.searchParams.get('materialId')
      if (materialId === MATERIAL_ID) {
        return HttpResponse.json(
          createPage([
            {
              warehouseId: SOURCE_WAREHOUSE_ID,
              materialId: MATERIAL_ID,
              quantity: 100,
              unitOfMeasureId: fixtureUomId(),
            },
          ]),
        )
      }
      return HttpResponse.json(createPage([]))
    }),
    http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
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
})
