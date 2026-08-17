import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPage, createWarehouse, createWarehouseDocument } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import DocumentListPage from './document-list-page'

const API_BASE_URL = '/api/v1'

const DOCUMENT_ROUTES = ['/documents/receiving', '/documents/opening', '/documents/return'] as const

function createWrapper(initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            {DOCUMENT_ROUTES.map((path) => (
              <Route key={path} path={path} element={<DocumentListPage />} />
            ))}
            <Route path="/documents/issue" element={<DocumentListPage />} />
            <Route path="/documents/transfer" element={<DocumentListPage />} />
            <Route
              path="/documents/:documentType/:documentId"
              element={<span role="status">تفاصيل السند</span>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('DocumentListPage', () => {
  it('renders contract-backed document rows and sends type + zero-based pagination filters', async () => {
    const document = createWarehouseDocument({ documentStatus: 'Posted' })
    const received: Array<Record<string, string | null>> = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        const url = new URL(request.url)
        received.push({
          documentType: url.searchParams.get('documentType'),
          pageIndex: url.searchParams.get('pageIndex'),
          pageSize: url.searchParams.get('pageSize'),
        })
        return HttpResponse.json(createPage([document], { totalItems: 11, totalPages: 2 }))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات الاستلام' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(document.systemReferenceNumber)).toBeInTheDocument()
    expect(screen.getByText(document.paperDocumentNumber)).toBeInTheDocument()
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    expect(screen.getByText(document.createdBy.displayName)).toBeInTheDocument()
    expect(screen.getByText(/يناير ٢٠٢٦/)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()

    expect(received).toContainEqual({
      documentType: 'Receiving',
      pageIndex: '0',
      pageSize: '10',
    })
  })

  it('sends the status and warehouse filters to the server', async () => {
    const user = userEvent.setup()
    const warehouse = createWarehouse()
    const receivedQueries: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        receivedQueries.push(new URL(request.url).searchParams.toString())
        return HttpResponse.json(
          createPage([createWarehouseDocument({ documentStatus: 'Submitted' })]),
        )
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })
    await screen.findByText('EIAMS-DOC-2024-0001')

    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة السند' }))
    await user.click(await screen.findByRole('option', { name: 'بانتظار الترحيل' }))

    fireEvent.change(screen.getByRole('combobox', { name: 'تصفية حسب المستودع' }), {
      target: { value: 'مركزي' },
    })
    await user.click(await screen.findByRole('option', { name: warehouse.nameAr }))

    await waitFor(() =>
      expect(
        receivedQueries.some(
          (query) =>
            query.includes('documentStatus=Submitted') &&
            query.includes(`warehouseId=${warehouse.warehouseId}`),
        ),
      ).toBe(true),
    )
  })

  it('sends the debounced search query to the server', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        receivedSearches.push(new URL(request.url).searchParams.get('search'))
        return HttpResponse.json(createPage([createWarehouseDocument()]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })
    await screen.findByText('EIAMS-DOC-2024-0001')

    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), '  استلام  ')

    await waitFor(() => expect(receivedSearches).toContain('استلام'))
  })

  it('renders an accessible Arabic error state and retries the failed list request', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createWarehouseDocument()]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل السندات' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('EIAMS-DOC-2024-0001')).toBeInTheDocument()
  })

  it('shows the Arabic empty state when the scoped server page has no documents', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

    expect(await screen.findByRole('heading', { name: 'لا توجد سندات' })).toBeInTheDocument()
  })

  it('derives the heading, type filter, and detail link from the route path', async () => {
    const user = userEvent.setup()
    const document = createWarehouseDocument({ documentId: 'a0e00000-0000-4000-8000-0000000000a1' })
    const received = { documentType: null as string | null }

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        received.documentType = new URL(request.url).searchParams.get('documentType')
        return HttpResponse.json(createPage([document]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/issue') })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات الصرف' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(received.documentType).toBe('Issue'))

    await user.click(await screen.findByRole('link', { name: document.systemReferenceNumber }))
    expect(await screen.findByRole('status')).toHaveTextContent('تفاصيل السند')
  })
})
