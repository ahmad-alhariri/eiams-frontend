import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'

import IssueDocumentFormPage from './issue-document-form-page'
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
const MATERIAL_ID = '77777777-7777-4777-8777-777777777703'
const UNIT_OF_MEASURE_ID = '99999999-9999-4999-8999-999999999901'
const ISSUE_DOCUMENT_ID = '44444444-4444-4444-8444-444444444704'

const sourceWarehouse = createWarehouse({
  warehouseId: SOURCE_WAREHOUSE_ID,
  nameAr: 'المستودع المركزي',
})
const material = createMaterial({ materialId: MATERIAL_ID })

let postedBody: Record<string, unknown> | undefined

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
  }
}

function useHandlers(balanceQuantity: number | 'fail') {
  postedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([sourceWarehouse]))),
    http.get(`${API_BASE_URL}/catalog/materials`, () => HttpResponse.json(createPage([material]))),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      HttpResponse.json([
        createWarehouseCapability({
          warehouseId: SOURCE_WAREHOUSE_ID,
          domain: material.domain,
          operations: ['Issue'],
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/inventory/balances`, () =>
      balanceQuantity === 'fail'
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(
            createPage([
              {
                warehouseId: SOURCE_WAREHOUSE_ID,
                materialId: MATERIAL_ID,
                quantity: balanceQuantity,
                unitOfMeasureId: UNIT_OF_MEASURE_ID,
              },
            ]),
          ),
    ),
    http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
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
        HttpResponse.json(
          createPage([
            {
              warehouseId: SOURCE_WAREHOUSE_ID,
              materialId: MATERIAL_ID,
              quantity: 100,
              unitOfMeasureId: UNIT_OF_MEASURE_ID,
            },
          ]),
        ),
      ),
    )
    await user.click(within(failure).getByRole('button', { name: 'إعادة المحاولة' }))

    expect(await screen.findByText(/تتجاوز الرصيد المتاح \(100\)/)).toBeInTheDocument()
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
