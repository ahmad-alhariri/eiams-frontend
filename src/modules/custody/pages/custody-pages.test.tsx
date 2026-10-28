import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { errJson, okPageJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import ActiveCustodyListPage from './active-custody-list-page'
import CustodyDetailPage from './custody-detail-page'
import type { Custody } from '@/modules/custody/types/custody.types'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'
const CUSTODY_ID = '44444444-4444-4444-8444-444444444444'

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (permission: string) => permission === 'asset.view' || permission === 'custody.assign',
  }),
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

/** The LIVE `GET /custodies` row: flat, camelCase, no nested holder object. */
const custodyRow: Custody = {
  subjectType: 'Asset',
  subjectId: ASSET_ID,
  custodyId: CUSTODY_ID,
  materialId: '22222222-2222-4222-8222-222222222222',
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: null,
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-PC-0001',
  assetNumber: 'AST-2023-C099',
  warehouseId: '33333333-3333-4333-8333-333333333333',
  warehouseName: 'المستودع المركزي',
  holderType: 'OrganizationalUnit',
  holderId: '55555555-5555-4555-8555-555555555555',
  holderDisplayName: 'مديرية النقل والحراسة',
  custodyKind: 'Operational',
  issuedQuantity: 1,
  activeQuantity: 1,
  returnedQuantity: 0,
  issueDocumentId: '66666666-6666-4666-8666-666666666666',
  systemReferenceNumber: 'ISSUE-2026-0001',
  status: 'Active',
  fromUtc: '2026-08-01T08:00:00.000Z',
  toUtc: null,
  rowVersion: 1,
}

/** The serial-tracked durable row: its status vocabulary is Issued/Returned/Disposed. */
const issuedTrackedUnitRow: Custody = {
  ...custodyRow,
  subjectType: 'TrackedUnit',
  custodyId: '44444444-4444-4444-8444-444444444445',
  materialKind: 'Durable',
  trackingType: 'Serial',
  assetNumber: null,
  serialNumber: 'SN-DUR-0007',
  holderDisplayName: 'مديرية الصيانة',
  status: 'Issued',
}

/**
 * The live `GET /custodies` honours `status`; the fixtures carry the
 * subject-dependent status values, so an unpinned request keeps every row.
 */
function filterByStatus(rows: readonly Custody[], request: Request): Custody[] {
  const requested = new URL(request.url).searchParams.get('status')
  return requested === null ? [...rows] : rows.filter((row) => row.status === requested)
}

function useCustodyHandlers(rows: readonly Custody[] = [custodyRow]) {
  server.use(
    http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
      const data = filterByStatus(rows, request)
      return okPageJson(data, {
        page: 1,
        pageSize: 20,
        totalCount: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      })
    }),
  )
}

function createWrapper(initialEntry: string, client: QueryClient = createQueryClient()) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/assets/:assetId" element={children} />
            <Route path="/custody/:custodyId" element={children} />
            <Route path="/custody/register" element={children} />
            <Route path="*" element={children} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }
}

describe('Active custody list + detail', () => {
  it('lists custody rows with the live holder, kind and status', async () => {
    useCustodyHandlers()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(screen.getByText(/مديرية النقل والحراسة/)).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
    // The status shows in the row badge.
    expect(screen.getAllByText('نشطة').length).toBeGreaterThan(0)
    expect(screen.getByText('عرض التفاصيل')).toBeInTheDocument()
  })

  it('sends the live list filters and no unsupported search box', async () => {
    let requestedParams: URLSearchParams | undefined
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        requestedParams = new URL(request.url).searchParams
        return okPageJson([custodyRow], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 })
      }),
    )
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    // Neither filter is pinned: the list shows every subject kind and every
    // status, because the status vocabulary is subject-dependent.
    expect(requestedParams?.has('subjectType')).toBe(false)
    expect(requestedParams?.has('status')).toBe(false)
    expect(requestedParams?.get('page')).toBe('1')
    expect(requestedParams?.has('search')).toBe(false)
    // The server ignores `search` on /custodies, so no search affordance is
    // offered at all.
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('narrows the list to one subject type through the select', async () => {
    const requestedParams: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        requestedParams.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([custodyRow], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 })
      }),
    )
    const user = userEvent.setup()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    await user.click(screen.getByLabelText('تصفية حسب نوع الموضوع'))
    await user.click(await screen.findByRole('option', { name: 'معمرة بالتسلسل' }))

    await waitFor(() =>
      expect(requestedParams).toContainEqual(
        expect.objectContaining({ subjectType: 'TrackedUnit', page: '1' }),
      ),
    )
  })

  it('identifies an Asset, a TrackedUnit and a MaterialQuantity subject per row', async () => {
    const materialQuantityRow: Custody = {
      ...custodyRow,
      subjectType: 'MaterialQuantity',
      custodyId: '44444444-4444-4444-8444-444444444446',
      materialNameAr: 'ورق تصوير',
      materialCode: 'OF-PAP-001',
      materialKind: 'Durable',
      trackingType: 'Quantity',
      assetNumber: null,
      serialNumber: null,
      issuedQuantity: 5,
      activeQuantity: 3,
      returnedQuantity: 2,
      status: 'FullyReturned',
    }

    server.use(
      http.get(`${API_BASE_URL}/custodies`, () =>
        okPageJson([custodyRow, issuedTrackedUnitRow, materialQuantityRow], {
          page: 1,
          pageSize: 20,
          totalCount: 3,
          totalPages: 1,
        }),
      ),
    )

    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    // Asset -> asset number.
    expect(await screen.findByText('أصل ثابت')).toBeInTheDocument()
    expect(screen.getAllByText('AST-2023-C099')).toHaveLength(2)
    // TrackedUnit -> serial number.
    expect(screen.getByText('معمرة بالتسلسل')).toBeInTheDocument()
    expect(screen.getByText('SN-DUR-0007')).toBeInTheDocument()
    // MaterialQuantity -> material name plus the quantity still in custody.
    expect(screen.getByText('معمرة بكمية')).toBeInTheDocument()
    expect(screen.getByText('ورق تصوير')).toBeInTheDocument()
    expect(screen.getByText('المتبقي في العهدة: ٣')).toBeInTheDocument()
    expect(screen.getByText('مرتجعة بالكامل')).toBeInTheDocument()
  })

  it('states that the rows are custody and links the stock balances screen', async () => {
    useCustodyHandlers()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    expect(await screen.findByText(/رصيد مخزون/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'أرصدة المخزون' })).toHaveAttribute(
      'href',
      '/inventory/balances',
    )
  })

  it('sends no status by default, so an Issued serial-tracked row is listed', async () => {
    const requestedParams: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        requestedParams.push(Object.fromEntries(new URL(request.url).searchParams))
        const rows = filterByStatus([custodyRow, issuedTrackedUnitRow], request)
        return okPageJson(rows, {
          page: 1,
          pageSize: 20,
          totalCount: rows.length,
          totalPages: rows.length === 0 ? 0 : 1,
        })
      }),
    )
    const user = userEvent.setup()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/register'),
    })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    // First paint pins no status, so the `Issued` TrackedUnit row is not hidden
    // by an `Active` default, and the dropdown says "every status".
    expect(requestedParams[0]?.['status']).toBeUndefined()
    expect(await screen.findByText('SN-DUR-0007')).toBeInTheDocument()
    expect(screen.getByLabelText('تصفية حسب حالة العهدة')).toHaveTextContent('كل الحالات')

    await user.click(screen.getByLabelText('تصفية حسب حالة العهدة'))
    // The option list still renders every status.
    expect(await screen.findByRole('option', { name: 'مغلقة' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'نشطة' })).toBeInTheDocument()

    // Choosing a status sends it and the server narrows the list to that status.
    await user.click(screen.getByRole('option', { name: 'مصروفة' }))
    await waitFor(() =>
      expect(requestedParams).toContainEqual(
        expect.objectContaining({ status: 'Issued', page: '1' }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /AST-2023-C099/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('SN-DUR-0007')).toBeInTheDocument()
  })

  it(
    'renders the detail page with holder and transfer card for an active row',
    { timeout: 15000 },
    async () => {
      useCustodyHandlers()
      render(<CustodyDetailPage />, {
        wrapper: createWrapper(`/custody/${CUSTODY_ID}`),
      })

      // The row query reuses the scoped list endpoint; wait for either outcome.
      await screen.findByText('الحائز', undefined, { timeout: 10000 })
      expect(screen.getByText('مديرية النقل والحراسة')).toBeInTheDocument()
      expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
      expect(screen.getByText('أصل ثابت')).toBeInTheDocument()
      expect(
        screen.getByText('تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.'),
      ).toBeInTheDocument()
      expect(screen.getByText('مبادلة المسؤولية')).toBeInTheDocument()
    },
  )

  // F-28: the live custody row carries the issue document's REFERENCE number,
  // so the page shows that and never the raw document guid.
  it(
    'renders the issue reference number instead of the raw document guid',
    { timeout: 15000 },
    async () => {
      useCustodyHandlers()
      render(<CustodyDetailPage />, {
        wrapper: createWrapper(`/custody/${CUSTODY_ID}`),
      })

      await screen.findByText('الحائز', undefined, { timeout: 10000 })
      expect(screen.getByText('ISSUE-2026-0001')).toBeInTheDocument()
      expect(screen.queryByText(custodyRow.issueDocumentId)).not.toBeInTheDocument()
    },
  )

  // F-27: a missing row and a failed load are DIFFERENT facts and must not
  // wear the same sentence. The shared copy table owns the Arabic for the
  // server's `CUSTODIES_NOT_FOUND`.
  it(
    'shows the mapped not-found copy when the custody row does not exist',
    { timeout: 15000 },
    async () => {
      server.use(
        http.get(`${API_BASE_URL}/custodies`, () =>
          okPageJson([], { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 }),
        ),
      )
      render(<CustodyDetailPage />, {
        wrapper: createWrapper(`/custody/${CUSTODY_ID}`),
      })

      expect(
        await screen.findByText('لم يتم العثور على العهدة.', undefined, { timeout: 10000 }),
      ).toBeInTheDocument()
      expect(screen.queryByText('تعذّر تحميل العهدة')).not.toBeInTheDocument()
    },
  )

  it(
    'shows the mapped not-found copy when the server answers 404',
    { timeout: 15000 },
    async () => {
      server.use(
        http.get(`${API_BASE_URL}/custodies`, () => errJson(404, { code: 'CUSTODIES_NOT_FOUND' })),
      )
      render(<CustodyDetailPage />, {
        wrapper: createWrapper(`/custody/${CUSTODY_ID}`),
      })

      expect(
        await screen.findByText('لم يتم العثور على العهدة.', undefined, { timeout: 10000 }),
      ).toBeInTheDocument()
      expect(screen.queryByText('تعذّر تحميل العهدة')).not.toBeInTheDocument()
    },
  )

  it('keeps the load-failure copy when the read fails', { timeout: 15000 }, async () => {
    server.use(http.get(`${API_BASE_URL}/custodies`, () => new HttpResponse(null, { status: 500 })))
    render(<CustodyDetailPage />, {
      wrapper: createWrapper(
        `/custody/${CUSTODY_ID}`,
        new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      ),
    })

    expect(
      await screen.findByText('تعذّر تحميل العهدة', undefined, { timeout: 10000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('لم يتم العثور على العهدة.')).not.toBeInTheDocument()
  })
})
