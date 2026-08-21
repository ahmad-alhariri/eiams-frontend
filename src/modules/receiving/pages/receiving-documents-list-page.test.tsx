import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPage, createWarehouse, createWarehouseDocument } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import ReceivingDocumentsListPage from './receiving-documents-list-page'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/documents/receiving']}>
          <ReceivingDocumentsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('ReceivingDocumentsListPage', () => {
  it('renders the receiving list with Arabic heading and contract-backed rows', async () => {
    const warehouse = createWarehouse()
    const document = createWarehouseDocument({
      documentStatus: 'Draft',
      warehouse: { id: warehouse.warehouseId, displayName: warehouse.nameAr },
      receivingInfo: { receivingType: 'Supplier', supplierRef: 'EXT-SUP-001' },
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('documentType')).toBe('Receiving')
        return HttpResponse.json(createPage([document]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json([warehouse])),
    )

    render(<ReceivingDocumentsListPage />, { wrapper: createWrapper() })

    expect(
      screen.getByRole('heading', { name: /سندات الاستلام|إيصالات الاستلام/ }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: document.systemReferenceNumber }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(document.warehouse.displayName)).toBeInTheDocument()
    expect(screen.getByText('مسودة')).toBeInTheDocument()
  })

  it('shows the Arabic error state and retries the failed request', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () =>
        HttpResponse.json({ titleAr: 'تعذر جلب السندات' }, { status: 500 }),
      ),
    )

    render(<ReceivingDocumentsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل السندات' })).toBeInTheDocument()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => HttpResponse.json(createPage([]))),
    )
    await userEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/i }))
    await waitFor(() => expect(screen.getByText(/لم يتم العثور على سندات/i)).toBeInTheDocument())
  })

  it('shows the Arabic empty state when the receiving page has no documents', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => HttpResponse.json(createPage([]))),
    )

    render(<ReceivingDocumentsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(/لم يتم العثور على سندات/i)).toBeInTheDocument()
    expect(screen.getByText(/لا توجد سندات/i)).toBeInTheDocument()
  })
})
