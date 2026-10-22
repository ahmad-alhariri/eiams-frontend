import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
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

function useCustodyHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/custodies`, () =>
      okPageJson([custodyRow], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }),
    ),
  )
}

function createWrapper(initialEntry: string) {
  const client = createQueryClient()
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/assets/:assetId" element={children} />
            <Route path="/custody/:custodyId" element={children} />
            <Route path="/custody/active" element={children} />
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
      wrapper: createWrapper('/custody/active'),
    })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(screen.getByText(/مديرية النقل والحراسة/)).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
    expect(screen.getByText('نشطة')).toBeInTheDocument()
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
      wrapper: createWrapper('/custody/active'),
    })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    expect(requestedParams?.get('subjectType')).toBe('Asset')
    expect(requestedParams?.get('page')).toBe('1')
    expect(requestedParams?.has('search')).toBe(false)
    // The server ignores `search` on /custodies, so no search affordance is
    // offered at all.
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('filters by custody status through the select', async () => {
    useCustodyHandlers()
    const user = userEvent.setup()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/active'),
    })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    await user.click(screen.getByLabelText('تصفية حسب حالة العهدة'))
    // The option list renders both statuses.
    expect(await screen.findByRole('option', { name: 'مغلقة' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'نشطة' })).toBeInTheDocument()
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
      expect(screen.getByText('مبادلة المسؤولية')).toBeInTheDocument()
    },
  )
})
