import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import ActiveCustodyListPage from './active-custody-list-page'
import CustodyDetailPage from './custody-detail-page'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ASSET_ID = fixtureUuid(235)
const CUSTODY_ID = fixtureUuid(52)

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

function useCustodyHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/custodies`, () =>
      HttpResponse.json({
        items: [
          {
            assetId: ASSET_ID,
            assetNumber: 'AST-2023-C099',
            custodyId: CUSTODY_ID,
            custodyKind: 'Operational',
            fromTs: '2026-08-01T08:00:00.000Z',
            holder: {
              displayName: 'مديرية النقل والحراسة',
              id: fixtureUuid(21),
              secondaryLabelAr: null,
              status: 'Active' as const,
              type: 'OrganizationalUnit' as const,
            },
            issueDocumentId: fixtureUuid(155),
            rowVersion: 1,
            status: 'Active',
          },
        ],
        meta: { pageIndex: 0, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
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

describe('Active custody list + detail (e19-t04)', () => {
  it('lists active custody rows with holder, kind, and status', async () => {
    useCustodyHandlers()
    render(<ActiveCustodyListPage />, {
      wrapper: createWrapper('/custody/active'),
    })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(screen.getByText(/مديرية النقل والحراسة/)).toBeInTheDocument()
    expect(screen.getByText('تشغيلي')).toBeInTheDocument()
    expect(screen.getByText('عرض التفاصيل')).toBeInTheDocument()
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
      await screen.findByText(/الحائز/, undefined, { timeout: 10000 })
      expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
      expect(screen.getByText('مبادلة المسؤولية')).toBeInTheDocument()
    },
  )
})
