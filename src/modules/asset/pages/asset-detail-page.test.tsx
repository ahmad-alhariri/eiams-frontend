import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
import { formatDateTime } from '@/shared/utils/format'

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
      okJson(
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
      okJson([
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

function renderPage(client: QueryClient = createQueryClient()) {
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

/**
 * `retry: false` so a deliberately failing read settles in one attempt. The
 * production `createQueryClient()` retries once with the default backoff, which
 * would leave the failure pending for ~1s of real time.
 */
function createDeterministicClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
        okJson(
          createAssetFixture({
            assetId: ASSET_ID,
            derivedStatus: 'InStock',
            material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () => okJson([])),
    )
    renderPage()

    expect(await screen.findByText('لا توجد عهدة مسجّلة لهذا الأصل.')).toBeInTheDocument()
  })

  // e24-t08: this page is the second surface rendering the same append-only
  // custody data as /assets/:assetId/custody. It rendered `fromTs` as a raw ISO
  // string and never rendered `toTs`, so the two surfaces of one immutable
  // ledger disagreed. Browser QA on the dev mock caught the raw ISO string.
  it('formats custody timestamps and shows a closed row end time', async () => {
    const fromTs = '2026-08-24T08:00:00.000Z'
    const toTs = '2026-09-02T11:30:00.000Z'
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        okJson(
          createAssetFixture({
            assetId: ASSET_ID,
            derivedStatus: 'InCustody',
            material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () =>
        okJson([
          createAssetCustody({
            custodyId: fixtureUuid(52),
            assetId: ASSET_ID,
            assetNumber: 'AST-2024-C01',
            custodyKind: 'Operational',
            status: 'Closed',
            holder: {
              displayName: 'مديرية المعلوماتية',
              id: fixtureUuid(20),
              secondaryLabelAr: null,
              status: 'Active' as const,
              type: 'OrganizationalUnit' as const,
            },
            fromTs,
            toTs,
          }),
        ]),
      ),
    )
    renderPage()

    await screen.findByText(/الحائز: مديرية المعلوماتية/)

    expect(screen.getByText(formatDateTime(fromTs))).toBeInTheDocument()
    expect(screen.getByText('نهاية العهدة:')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(toTs))).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(fromTs)
    expect(document.body.textContent).not.toContain(toTs)
  })

  it('omits the end time for an open custody row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        okJson(
          createAssetFixture({
            assetId: ASSET_ID,
            derivedStatus: 'InCustody',
            material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () =>
        okJson([
          createAssetCustody({
            custodyId: fixtureUuid(53),
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
            toTs: null,
          }),
        ]),
      ),
    )
    renderPage()

    await screen.findByText(/الحائز: مديرية المعلوماتية/)
    expect(screen.queryByText('نهاية العهدة:')).not.toBeInTheDocument()
  })

  // e24-t10 / B4. The custody read, the empty read, and the failed read were
  // one ternary, so a FAILED read rendered "لا توجد عهدة مسجّلة لهذا الأصل" —
  // a claim that the asset has no custodian at all, which the server never
  // made, with no retry. The sibling page already reports the same failed read
  // correctly; this suite pins that the two surfaces agree.
  it('reports a failed custody read as an error with a retry, never as "no custody"', async () => {
    let custodyRequests = 0
    let custodyShouldFail = true
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        okJson(
          createAssetFixture({
            assetId: ASSET_ID,
            assetNumber: 'AST-2024-C01',
            derivedStatus: 'InCustody',
            material: { id: fixtureUuid(61), displayName: 'حاسوب مكتبي' },
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () => {
        custodyRequests += 1
        if (custodyShouldFail) {
          return new HttpResponse(null, { status: 500 })
        }
        return okJson([
          createAssetCustody({
            custodyId: fixtureUuid(54),
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
            toTs: null,
          }),
        ])
      }),
    )
    renderPage(createDeterministicClient())

    // The asset itself loaded fine, so only the custody surface degrades.
    expect(await screen.findByText('AST-2024-C01')).toBeInTheDocument()
    const error = (await screen.findByText('تعذّر تحميل سجل العهدة')).closest<HTMLElement>(
      '[data-slot="error-state"]',
    )!
    expect(error).toHaveAttribute('role', 'alert')
    // The false claim about the asset's custody is gone.
    expect(screen.queryByText('لا توجد عهدة مسجّلة لهذا الأصل.')).not.toBeInTheDocument()

    custodyShouldFail = false
    fireEvent.click(within(error).getByRole('button', { name: 'إعادة المحاولة' }))

    expect(await screen.findByText(/الحائز: مديرية المعلوماتية/)).toBeInTheDocument()
    expect(screen.queryByText('تعذّر تحميل سجل العهدة')).not.toBeInTheDocument()
    expect(custodyRequests).toBeGreaterThan(1)
  })

  it('uses the shared retry Button, not a hand-rolled element, for the asset read failure', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody`, () => okJson([])),
    )
    const { container } = renderPage(createDeterministicClient())

    const retry = await screen.findByRole('button', { name: 'إعادة المحاولة' })
    expect(retry).toHaveAttribute('data-slot', 'button')
    expect(retry.className).toContain('h-8')
    // The hand-rolled element was a raw <button> with no design-system slot.
    expect(container.querySelector('button:not([data-slot="button"])')).toBeNull()
  })
})
