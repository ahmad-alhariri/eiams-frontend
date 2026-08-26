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

import OpeningDocumentsListPage from './opening-documents-list-page'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/documents/opening']}>
          <OpeningDocumentsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('OpeningDocumentsListPage', () => {
  it('renders the opening list and sends the Opening document-type filter to the contract endpoint', async () => {
    const warehouse = createWarehouse()
    const document = createWarehouseDocument({
      documentStatus: 'Draft',
      documentType: 'Opening',
      warehouse: { id: warehouse.warehouseId, displayName: warehouse.nameAr },
    })

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('documentType')).toBe('Opening')
        return HttpResponse.json(createPage([document]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json([warehouse])),
    )

    render(<OpeningDocumentsListPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات الافتتاح' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: document.systemReferenceNumber }),
    ).toHaveAttribute('href', `/documents/opening/${document.documentId}`)
    expect(screen.getByText(document.warehouse.displayName)).toBeInTheDocument()
  })

  it('shows the Arabic error state and retries the opening-document request', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () =>
        HttpResponse.json({ titleAr: 'تعذر جلب السندات' }, { status: 500 }),
      ),
    )

    render(<OpeningDocumentsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل السندات' })).toBeInTheDocument()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('documentType')).toBe('Opening')
        return HttpResponse.json(createPage([]))
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/i }))

    await waitFor(() => expect(screen.getByText(/لم يتم العثور على سندات/i)).toBeInTheDocument())
  })

  it('shows the Arabic empty state for an empty opening-document page', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('documentType')).toBe('Opening')
        return HttpResponse.json(createPage([]))
      }),
    )

    render(<OpeningDocumentsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد سندات' })).toBeInTheDocument()
  })
})
