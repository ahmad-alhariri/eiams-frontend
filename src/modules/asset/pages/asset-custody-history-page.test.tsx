import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AssetCustodyHistoryPage from './asset-custody-history-page'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const ASSET_ID = '23533333-3333-4333-8333-333333333335'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

function useCustodyTimelineHandler() {
  server.use(
    http.get(`${API_BASE_URL}/assets/:assetId/custody`, () =>
      HttpResponse.json([
        {
          assetId: ASSET_ID,
          assetNumber: 'AST-2024-C01',
          custodyId: fixtureUuid(61),
          custodyKind: 'Operational',
          fromTs: '2026-07-01T08:00:00.000Z',
          holder: {
            displayName: 'مديرية النقل والحراسة',
            id: fixtureUuid(21),
            secondaryLabelAr: null,
            status: 'Active' as const,
            type: 'OrganizationalUnit' as const,
          },
          issueDocumentId: fixtureUuid(155),
          rowVersion: 1,
          status: 'Closed',
        },
        {
          assetId: ASSET_ID,
          assetNumber: 'AST-2024-C01',
          custodyId: fixtureUuid(62),
          custodyKind: 'Personal',
          fromTs: '2026-08-01T08:00:00.000Z',
          holder: {
            displayName: 'أحمد الخالد',
            id: fixtureUuid(15),
            secondaryLabelAr: null,
            status: 'Active' as const,
            type: 'Employee' as const,
          },
          issueDocumentId: fixtureUuid(155),
          rowVersion: 1,
          status: 'Active',
        },
      ]),
    ),
  )
}

function renderPage() {
  const client = createQueryClient()
  return render(
    <MemoryRouter initialEntries={[`/assets/${ASSET_ID}/custody`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/assets/:assetId/custody" element={<AssetCustodyHistoryPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AssetCustodyHistoryPage (e19-t08)', () => {
  it('renders the immutable timeline newest-first with both closed and active rows', async () => {
    useCustodyTimelineHandler()
    renderPage()

    expect(await screen.findByText('أحمد الخالد')).toBeInTheDocument()
    // Newest first: the Personal row (Aug) precedes the Operational row (Jul).
    const rows = screen.getAllByRole('row')
    const bodyText = rows.map((row) => row.textContent ?? '')
    const personalIndex = bodyText.findIndex((text) => text.includes('أحمد الخالد'))
    const operationalIndex = bodyText.findIndex((text) => text.includes('مديرية النقل والحراسة'))
    expect(personalIndex).toBeGreaterThan(-1)
    expect(operationalIndex).toBeGreaterThan(-1)
    expect(personalIndex).toBeLessThan(operationalIndex)
    expect(screen.getByText('حفظ شخصي')).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
  })

  it('shows the read-only notice and no mutation actions', async () => {
    useCustodyTimelineHandler()
    renderPage()

    await screen.findByText('أحمد الخالد')
    expect(screen.getByText(/للقراءة فقط ولا يجوز تعديله أو حذفه/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تكليف موظف' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'مبادلة المسؤولية' })).toBeNull()
  })
})
