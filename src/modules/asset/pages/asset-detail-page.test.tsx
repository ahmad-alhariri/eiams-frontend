import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import {
  createAssetCustody,
  createAsset as createAssetFixture,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

import AssetDetailPage from './asset-detail-page'

const API_BASE_URL = '/api/v1'
const ASSET_ID = fixtureUuid(230)
const WAREHOUSE_ID = fixtureUuid(30)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

function useDetailHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
      HttpResponse.json(
        createAssetFixture({
          assetId: ASSET_ID,
          assetNumber: 'AST-2024-C01',
          serialNumber: 'SN-PC-0001',
          derivedStatus: 'InStock',
          material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          currentWarehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
          acquisitionDate: '2024-03-01',
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () =>
      HttpResponse.json([
        createAssetCustody({
          custodyId: fixtureUuid(51),
          assetId: ASSET_ID,
          assetNumber: 'AST-2024-C01',
          custodyKind: 'Operational',
          status: 'Active',
          holder: {
            displayName: 'مديرية المعلوماتية',
            id: fixtureUuid(20),
            secondaryLabelAr: null,
            status: 'Active' as const,
            type: 'OrganizationalUnit' as const,
          },
          fromTs: '2026-08-24T08:00:00.000Z',
        }),
      ]),
    ),
  )
}

function renderPage() {
  const client = createQueryClient()
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`/assets/${ASSET_ID}`]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/assets/:assetId" element={children} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }
  return render(<AssetDetailPage />, { wrapper: Wrapper })
}

describe('AssetDetailPage (e18-t03)', () => {
  it('renders the spine fields with the derived-status badge', async () => {
    useDetailHandlers()
    renderPage()

    expect(await screen.findByText('AST-2024-C01')).toBeInTheDocument()
    expect(screen.getByText('SN-PC-0001')).toBeInTheDocument()
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
  })

  it('renders the custody timeline with holder and kind', async () => {
    useDetailHandlers()
    renderPage()

    expect(await screen.findByText(/الحائز: مديرية المعلوماتية/)).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
    expect(screen.getByText('نشطة')).toBeInTheDocument()
  })

  it('shows the no-custody note when the timeline is empty', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        HttpResponse.json(
          createAssetFixture({
            assetId: ASSET_ID,
            derivedStatus: 'InStock',
            material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () => HttpResponse.json([])),
    )
    renderPage()

    expect(await screen.findByText('لا توجد عهدة مسجّلة لهذا الأصل.')).toBeInTheDocument()
  })
})
