import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import ReturnDocumentFormPage from './return-document-form-page'
import {
  createMaterial,
  createPage,
  createWarehouse,
  createWarehouseCapability,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { ROUTE_PATHS } from '@/config/routes'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ISSUE_DOC_ID = fixtureUuid(155)
const RETURN_DOC_ID = fixtureUuid(170)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: () => true }),
}))

const WAREHOUSE_ID = fixtureUuid(30)
const WAREHOUSE = createWarehouse({ warehouseId: WAREHOUSE_ID })
const MATERIAL_ID = fixtureUuid(40)
const MATERIAL = createMaterial({ materialId: MATERIAL_ID })

async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByText(WAREHOUSE.nameAr))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/151')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')
}

function useDocumentHandlers() {
  // Header section fetches warehouse options for the source-warehouse select.
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([WAREHOUSE]))),
    http.get(`${API_BASE_URL}/catalog/materials`, () => HttpResponse.json(createPage([MATERIAL]))),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      HttpResponse.json([
        createWarehouseCapability({
          warehouseId: WAREHOUSE_ID,
          domain: MATERIAL.domain,
          operations: ['Return', 'Issue', 'Receiving'],
        }),
      ]),
    ),
    http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      expect(body['documentType']).toBe('Return')
      const returnInfo = body['returnInfo'] as Record<string, unknown>
      expect(returnInfo['originalIssueDocumentId']).toBe(ISSUE_DOC_ID)
      return HttpResponse.json(
        {
          documentId: RETURN_DOC_ID,
          documentNumber: 'RETURN-2026-0001',
          documentType: 'Return',
          status: 'Draft',
        },
        { status: 201 },
      )
    }),
  )
}

const client = createQueryClient()

function QueryWrapper() {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ROUTE_PATHS.documentReturnNew]}>
        <Routes>
          <Route path={ROUTE_PATHS.documentReturnNew} element={<ReturnDocumentFormPage />} />
          <Route
            path={ROUTE_PATHS.documentReturnDetail}
            element={<div data-testid="detail-stub">DETAIL-LANDING</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderPage() {
  return render(<ReturnDocumentFormPage />, { wrapper: QueryWrapper })
}

describe('ReturnDocumentFormPage (e19-t06)', () => {
  it('renders the spine, return petal fields, and line editor', async () => {
    useDocumentHandlers()
    renderPage()

    expect(await screen.findByText('سند إرجاع جديد')).toBeInTheDocument()
    expect(screen.getByLabelText('معرّف سند الصرف الأصلي')).toBeInTheDocument()
    expect(screen.getByLabelText('سبب الإرجاع')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeInTheDocument()
  })

  it('blocks submission without the mandatory original-issue id and reason', async () => {
    useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب إدخال معرّف سند الصرف الأصلي.')).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال سبب الإرجاع.')).toBeInTheDocument()
  })

  it(
    'posts a contract-shaped Return draft and navigates to the detail route',
    { timeout: 20000 },
    async () => {
      useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      // Fill the single quantity line.
      const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
      await user.click(materialCombo)
      await user.type(materialCombo, 'حاسوب')
      const materialOptions = await screen.findAllByRole('option')
      const target = materialOptions.find((option) =>
        (option.textContent ?? '').includes(MATERIAL.nameAr),
      )
      expect(target).toBeDefined()
      if (target) {
        await user.click(target)
      }
      await user.type(screen.getByLabelText('الكمية'), '5')

      // Fill the petal.
      await user.type(screen.getByLabelText('معرّف سند الصرف الأصلي'), ISSUE_DOC_ID)
      await user.type(screen.getByLabelText('رقم سند الصرف الورقي (اختياري)'), 'ISSUE-2026-0001')
      await user.type(screen.getByLabelText('سبب الإرجاع'), 'عودة المواد بعد انتهاء الحاجة')

      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      await waitFor(
        () => {
          expect(screen.getByText('DETAIL-LANDING')).toBeInTheDocument()
        },
        { timeout: 8000 },
      )
    },
  )
})
