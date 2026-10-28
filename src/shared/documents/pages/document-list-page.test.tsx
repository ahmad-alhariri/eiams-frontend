import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouse,
  createWarehouseDocument,
} from '@/test/msw/factories'
import { okPageJson } from '@/test/msw/envelope'
import { wireDocumentSummary } from '@/test/msw/document-wire-fixtures'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import DocumentListPage from './document-list-page'

const API_BASE_URL = '/api/v1'

const DOCUMENT_ROUTES = ['/documents/receiving', '/documents/opening', '/documents/return'] as const

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير المستندات' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

function createWrapper(initialPath: string, permissionCodes: readonly string[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

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
              path="/documents/receiving/new"
              element={<span role="status">نموذج استلام جديد</span>}
            />
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
          // The wire parameter is one-based `page`, not the zero-based `pageIndex`.
          page: url.searchParams.get('page'),
          pageSize: url.searchParams.get('pageSize'),
        })
        return okPageJson([wireDocumentSummary(document)], {
          page: 1,
          pageSize: 10,
          totalCount: 11,
          totalPages: 2,
        })
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات الاستلام' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(document.systemReferenceNumber)).toBeInTheDocument()
    expect(screen.getByText(document.paperDocumentNumber)).toBeInTheDocument()
    // The list projection carries `warehouseId` and no display reference, so the
    // row shows the id the server sent rather than a label it never sent.
    expect(screen.getByText(document.warehouse.id)).toBeInTheDocument()
    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    // No creator column exists: `WarehouseDocumentSummary` carries no user
    // reference, so the creator name the snapshot had is asserted nowhere.
    expect(screen.getByText(/يناير ٢٠٢٦/)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()

    expect(received).toContainEqual({
      documentType: 'Receiving',
      // One-based on the wire; the zero-based `pageIndex: 0` starts as `page: 1`.
      page: '1',
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
        return okPageJson([createWarehouseDocument({ documentStatus: 'Submitted' })])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })
    await screen.findByText('EIAMS-DOC-2024-0001')

    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة السند' }))
    await user.click(await screen.findByRole('option', { name: 'بانتظار الترحيل' }))

    fireEvent.change(screen.getByRole('combobox', { name: 'تصفية حسب المستودع' }), {
      target: { value: 'مركزي' },
    })
    await user.click(await screen.findByRole('option', { name: warehouse.name }))

    await waitFor(() =>
      expect(
        receivedQueries.some(
          (query) =>
            query.includes('documentStatus=Submitted') &&
            query.includes(`warehouseId=${warehouse.id}`),
        ),
      ).toBe(true),
    )
  })

  it('sends the debounced search query to the server', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        receivedSearches.push(new URL(request.url).searchParams.get('systemReferenceNumber'))
        return okPageJson([wireDocumentSummary(createWarehouseDocument())])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
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
          : okPageJson([wireDocumentSummary(createWarehouseDocument())])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل السندات' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('EIAMS-DOC-2024-0001')).toBeInTheDocument()
  })

  it('shows the Arabic empty state when the scoped server page has no documents', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
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
        return okPageJson([document])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, { wrapper: createWrapper('/documents/issue') })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات الصرف' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(received.documentType).toBe('Issue'))

    await user.click(await screen.findByRole('link', { name: document.systemReferenceNumber }))
    expect(await screen.findByRole('status')).toHaveTextContent('تفاصيل السند')
  })

  /**
   * The route → document-type mapping lives in `document-route-entries.ts`
   * only; this page used to keep a second copy of it.
   */
  it.each([
    ['/documents/transfer', 'Transfer'],
    ['/documents/return', 'Return'],
  ])('serves the %s list with its own document type', async (path, documentType) => {
    const received = { documentType: null as string | null }

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        received.documentType = new URL(request.url).searchParams.get('documentType')
        return okPageJson([])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, { wrapper: createWrapper(path) })

    await waitFor(() => expect(received.documentType).toBe(documentType))
  })

  it('offers the create action to a user with document.create and navigates to the new-document route', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, {
      wrapper: createWrapper('/documents/receiving', ['document.view', 'document.create']),
    })

    await screen.findByRole('heading', { level: 1, name: 'سندات الاستلام' })
    const createButton = screen.getByRole('button', { name: 'سند استلام جديد' })
    expect(createButton).toHaveAttribute('href', '/documents/receiving/new')

    await user.click(createButton)
    expect(await screen.findByRole('status')).toHaveTextContent('نموذج استلام جديد')
  })

  it('hides the create action from a user without document.create', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
    )

    render(<DocumentListPage />, {
      wrapper: createWrapper('/documents/receiving', ['document.view']),
    })

    await screen.findByRole('heading', { level: 1, name: 'سندات الاستلام' })
    expect(screen.queryByRole('button', { name: 'سند استلام جديد' })).not.toBeInTheDocument()
  })

  describe('D-OPEN-02 Opening cut-off column', () => {
    const AS_OF_DATE = '2026-01-01'

    function openingDocumentHandler(
      overrides: { openingAsOfDate?: string | null; openingIsZeroStock?: boolean } = {},
    ) {
      return http.get(`${API_BASE_URL}/warehouse-documents`, () =>
        okPageJson([
          // The generated nested model predates the D-OPEN-02 columns, so they
          // are written onto it by name here — the same way the harness reads
          // them back through `readOpeningField`. Writing them at the wire level
          // instead would bypass the projection and stop proving anything.
          wireDocumentSummary({
            ...createWarehouseDocument({ documentType: 'Opening' }),
            openingAsOfDate: AS_OF_DATE,
            openingIsZeroStock: false,
            ...overrides,
          } as Parameters<typeof wireDocumentSummary>[0]),
        ]),
      )
    }

    it('renders the as-of-date column on the Opening list', async () => {
      server.use(
        openingDocumentHandler(),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/opening') })

      expect(
        await screen.findByRole('columnheader', { name: 'تاريخ الرصيد الافتتاحي' }),
      ).toBeInTheDocument()
    })

    /**
     * The cell of the first data row under a given column header.
     *
     * The Opening list carries two dates — the cut-off date and `createdAtUtc` —
     * and `paperDocumentNumber` falls back to an em dash. Matching on text alone
     * would match both dates and cannot tell which cell rendered, so the
     * assertion is scoped by column position instead.
     */
    async function cellUnderColumn(name: string): Promise<HTMLElement> {
      const header = await screen.findByRole('columnheader', { name })
      const columnIndex = within(header.parentElement as HTMLElement)
        .getAllByRole('columnheader')
        .indexOf(header)
      const row = await screen.findByRole('row', { name: /EIAMS-DOC/ })
      return within(row).getAllByRole('cell')[columnIndex] as HTMLElement
    }

    it('renders the cut-off date from the ISO wire value, in its own cell', async () => {
      server.use(
        openingDocumentHandler(),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/opening') })

      const cell = await cellUnderColumn('تاريخ الرصيد الافتتاحي')
      // `formatDate` renders Arabic-Indic digits, so the formatted output is
      // matched rather than the raw `2026-01-01` the wire carried.
      expect(cell).toHaveTextContent('٢٠٢٦')
      expect(cell).not.toHaveTextContent('2026-01-01')
    })

    it('does not render the column on a non-Opening list', async () => {
      server.use(
        http.get(`${API_BASE_URL}/warehouse-documents`, () =>
          okPageJson([wireDocumentSummary(createWarehouseDocument({ documentType: 'Receiving' }))]),
        ),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/receiving') })

      await screen.findByRole('heading', { level: 1, name: 'سندات الاستلام' })
      expect(
        screen.queryByRole('columnheader', { name: 'تاريخ الرصيد الافتتاحي' }),
      ).not.toBeInTheDocument()
    })

    it('shows a zero-stock chip only on a zero-stock row', async () => {
      server.use(
        openingDocumentHandler({ openingIsZeroStock: true }),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/opening') })

      expect(await screen.findByText('تهيئة بدون حركة')).toBeInTheDocument()
    })

    it('omits the zero-stock chip on a positive-stock row', async () => {
      server.use(
        openingDocumentHandler({ openingIsZeroStock: false }),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/opening') })

      await screen.findByRole('columnheader', { name: 'تاريخ الرصيد الافتتاحي' })
      expect(screen.queryByText('تهيئة بدون حركة')).not.toBeInTheDocument()
    })

    it('renders an em dash for a draft that has no cut-off date yet', async () => {
      server.use(
        openingDocumentHandler({ openingAsOfDate: null }),
        http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
      )

      render(<DocumentListPage />, { wrapper: createWrapper('/documents/opening') })

      const cell = await cellUnderColumn('تاريخ الرصيد الافتتاحي')
      expect(cell).toHaveTextContent('—')
      expect(cell).not.toHaveTextContent('٢٠٢٦')
    })
  })
})
