import { QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import { http } from 'msw'
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
    // Live wire shape (D-INT-02): GET /assets/{assetId}/custody-timeline
    // answers ApiResponse<IReadOnlyList<AssetCustodyTimelineResponse>>.
    // The row carries holderType + holderId (no embedded display name) and
    // uses `fromUtc` / `toUtc` rather than `fromTs` / `toTs`. The display
    // name asserted in the body is overlaid by the page from the type+id pair
    // until the counterpart lookup pipeline is added.
    http.get(`${API_BASE_URL}/assets/:assetId/custody-timeline`, () =>
      okJson([
        {
          assetId: ASSET_ID,
          custodyId: fixtureUuid(61),
          custodyKind: 'Operational',
          fromUtc: '2026-07-01T08:00:00.000Z',
          toUtc: '2026-08-01T07:59:59.999Z',
          holderId: fixtureUuid(21),
          holderType: 'OrganizationalUnit',
          issueDocumentId: fixtureUuid(155),
          returnDocumentId: null,
          rowVersion: 1,
          status: 'Closed',
        },
        {
          assetId: ASSET_ID,
          custodyId: fixtureUuid(62),
          custodyKind: 'Personal',
          fromUtc: '2026-08-01T08:00:00.000Z',
          toUtc: null,
          holderId: fixtureUuid(15),
          holderType: 'Employee',
          issueDocumentId: fixtureUuid(155),
          returnDocumentId: null,
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

    // Live timeline row exposes holderType + holderId only (no embedded
    // display name); the page surfaces both as a typed id pair until the
    // counterpart lookup pipeline is added.
    expect(await screen.findByText(/Employee:/)).toBeInTheDocument()
    expect(screen.getByText(/OrganizationalUnit:/)).toBeInTheDocument()
    // Newest first: the Personal row (Aug) precedes the Operational row (Jul).
    const rows = screen.getAllByRole('row')
    const bodyText = rows.map((row) => row.textContent ?? '')
    const personalIndex = bodyText.findIndex((text) => text.includes('Employee:'))
    const operationalIndex = bodyText.findIndex((text) => text.includes('OrganizationalUnit:'))
    expect(personalIndex).toBeGreaterThan(-1)
    expect(operationalIndex).toBeGreaterThan(-1)
    expect(personalIndex).toBeLessThan(operationalIndex)
    expect(screen.getByText('حفظ شخصي')).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
  })

  it('shows the read-only notice and no mutation actions', async () => {
    useCustodyTimelineHandler()
    renderPage()

    await screen.findByText(/Employee:/)
    expect(screen.getByText(/للقراءة فقط ولا يجوز تعديله أو حذفه/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تكليف موظف' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'مبادلة المسؤولية' })).toBeNull()
  })
})
