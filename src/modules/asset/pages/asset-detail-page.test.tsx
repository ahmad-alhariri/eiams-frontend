import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type {
  AssetCustodyTimelineRow,
  AssetCurrentStatusInfo,
  AssetDetails,
} from '@/modules/asset/types/asset.types'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'
import { formatDateTime } from '@/shared/utils/format'

import AssetDetailPage from './asset-detail-page'

const API_BASE_URL = '/api/v1'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

/** The LIVE `GET /assets/{assetId}` row (`AssetDetailsResponse`). */
function assetDetails(overrides: Partial<AssetDetails> = {}): AssetDetails {
  return {
    id: ASSET_ID,
    assetNumber: 'AST-2024-C01',
    serialNumber: 'SN-PC-0001',
    materialId: '22222222-2222-4222-8222-222222222222',
    materialCode: 'IT-HW-PC-001',
    materialNameAr: 'حاسوب مكتبي',
    materialNameEn: 'Desktop Computer',
    warehouseId: WAREHOUSE_ID,
    warehouseCode: 'WH-CENTRAL',
    warehouseName: 'المستودع المركزي',
    currentStatus: 'InStock',
    activeCustodyId: null,
    holderType: null,
    holderId: null,
    custodyKind: null,
    latestMovementType: null,
    latestMovementAtUtc: null,
    receiptLineId: null,
    receiptDocumentId: null,
    receiptDocumentReference: null,
    acquisitionDate: '2024-03-01',
    warrantyExpiry: null,
    rowVersion: 1,
    ...overrides,
  }
}

/** The LIVE `GET /assets/{assetId}/current-status` row. */
function currentStatus(overrides: Partial<AssetCurrentStatusInfo> = {}): AssetCurrentStatusInfo {
  return {
    assetId: ASSET_ID,
    materialId: '22222222-2222-4222-8222-222222222222',
    warehouseId: WAREHOUSE_ID,
    assetNumber: 'AST-2024-C01',
    serialNumber: 'SN-PC-0001',
    currentStatus: 'InStock',
    activeCustodyId: null,
    holderType: null,
    holderId: null,
    custodyKind: null,
    latestMovementType: null,
    latestMovementAtUtc: null,
    ...overrides,
  }
}

/**
 * Live wire for `GET /assets/{assetId}/custody-timeline`: the typed fields
 * only. The holder display name lives in the sibling counterpart lookup and
 * is not part of the timeline row.
 */
function buildTimelineEntry(
  overrides: Partial<AssetCustodyTimelineRow> = {},
): AssetCustodyTimelineRow {
  return {
    assetId: ASSET_ID,
    custodyId: '44444444-4444-4444-8444-444444444444',
    custodyKind: 'Operational',
    fromUtc: '2026-08-24T08:00:00.000Z',
    holderId: '55555555-5555-4555-8555-555555555555',
    holderType: 'OrganizationalUnit',
    issueDocumentId: '66666666-6666-4666-8666-666666666666',
    returnDocumentId: null,
    rowVersion: 1,
    status: 'Active',
    toUtc: null,
    ...overrides,
  }
}

function useDetailHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => okJson(assetDetails())),
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () =>
      okJson([buildTimelineEntry()]),
    ),
    http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
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

describe('AssetDetailPage', () => {
  it('renders the live spine fields and the status badge', async () => {
    useDetailHandlers()
    renderPage()

    expect(await screen.findByText('AST-2024-C01')).toBeInTheDocument()
    expect(screen.getByText('SN-PC-0001')).toBeInTheDocument()
    // The live row carries the material and warehouse names flat.
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
  })

  it('renders the derived status projection with its holder and last movement', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => okJson(assetDetails())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () =>
        okJson(
          currentStatus({
            currentStatus: 'InCustody',
            holderType: 'Employee',
            holderId: '55555555-5555-4555-8555-555555555555',
            custodyKind: 'Personal',
            latestMovementType: 'Issued',
            latestMovementAtUtc: '2026-08-24T10:00:00.000Z',
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([])),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage()

    expect(await screen.findByText('قيد العهدة')).toBeInTheDocument()
    // The live projection carries the holder TYPE and ID only.
    expect(screen.getByText('Employee/55555555-5555-4555-8555-555555555555')).toBeInTheDocument()
    expect(screen.getByText('حفظ شخصي')).toBeInTheDocument()
    expect(screen.getByText('صرف')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime('2026-08-24T10:00:00.000Z'))).toBeInTheDocument()
  })

  it('renders the custody timeline with holder and kind', async () => {
    useDetailHandlers()
    renderPage()

    expect(await screen.findByText(/الحائز: OrganizationalUnit/)).toBeInTheDocument()
    expect(screen.getByText('حفظ تشغيلي')).toBeInTheDocument()
    expect(screen.getByText('نشطة')).toBeInTheDocument()
  })

  it('shows the no-custody note when the timeline is empty', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => okJson(assetDetails())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([])),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage()

    expect(await screen.findByText('لا توجد عهدة مسجّلة لهذا الأصل.')).toBeInTheDocument()
  })

  // e24-t08: this page is the second surface rendering the same append-only
  // custody data as /assets/:assetId/custody-timeline. Live row uses
  // `fromUtc` / `toUtc` (D-INT-02). It rendered `fromTs` as a raw ISO string
  // and never rendered `toTs`, so the two surfaces of one immutable ledger
  // disagreed. Browser QA on the dev mock caught the raw ISO string.
  it('formats custody timestamps and shows a closed row end time', async () => {
    const fromUtc = '2026-08-24T08:00:00.000Z'
    const toUtc = '2026-09-02T11:30:00.000Z'
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        okJson(assetDetails({ currentStatus: 'InCustody' })),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () =>
        okJson(currentStatus({ currentStatus: 'InCustody' })),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () =>
        okJson([
          buildTimelineEntry({
            custodyId: '99999999-9999-4999-8999-999999999999',
            status: 'Closed',
            fromUtc,
            toUtc,
          }),
        ]),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage()

    await screen.findByText(/الحائز: OrganizationalUnit/)

    expect(screen.getByText(formatDateTime(fromUtc))).toBeInTheDocument()
    expect(screen.getByText('نهاية العهدة:')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(toUtc))).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(fromUtc)
    expect(document.body.textContent).not.toContain(toUtc)
  })

  it('omits the end time for an open custody row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        okJson(assetDetails({ currentStatus: 'InCustody' })),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () =>
        okJson(currentStatus({ currentStatus: 'InCustody' })),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () =>
        okJson([
          buildTimelineEntry({
            custodyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            status: 'Active',
            fromUtc: '2026-08-24T08:00:00.000Z',
            toUtc: null,
          }),
        ]),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage()

    await screen.findByText(/الحائز: OrganizationalUnit/)
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
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => okJson(assetDetails())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => {
        custodyRequests += 1
        if (custodyShouldFail) {
          return new HttpResponse(null, { status: 500 })
        }
        return okJson([
          buildTimelineEntry({
            custodyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            status: 'Active',
            fromUtc: '2026-08-24T08:00:00.000Z',
            toUtc: null,
          }),
        ])
      }),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
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

    expect(await screen.findByText(/الحائز: OrganizationalUnit/)).toBeInTheDocument()
    expect(screen.queryByText('تعذّر تحميل سجل العهدة')).not.toBeInTheDocument()
    expect(custodyRequests).toBeGreaterThan(1)
  })

  it('uses the shared retry Button, not a hand-rolled element, for the asset read failure', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([])),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    const { container } = renderPage(createDeterministicClient())

    const retry = await screen.findByRole('button', { name: 'إعادة المحاولة' })
    expect(retry).toHaveAttribute('data-slot', 'button')
    expect(retry.className).toContain('h-8')
    // The hand-rolled element was a raw <button> with no design-system slot.
    expect(container.querySelector('button:not([data-slot="button"])')).toBeNull()
  })

  // F-27: a missing asset and a failed read are DIFFERENT facts. The shared
  // copy table owns the Arabic for the server's `ASSETS_NOT_FOUND`, so the
  // 404 speaks the mapped sentence while the page's own "تعذّر تحميل الأصل"
  // stays for a genuine load failure.
  it('shows the mapped not-found copy when the server answers 404', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () =>
        errJson(404, { code: 'ASSETS_NOT_FOUND' }),
      ),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([])),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage(createDeterministicClient())

    expect(await screen.findByText('لم يتم العثور على الأصل.')).toBeInTheDocument()
    // The generic load-failure copy no longer covers a missing row.
    expect(screen.queryByText('تعذّر تحميل الأصل')).not.toBeInTheDocument()
    expect(screen.getByText('لا يوجد أصل بهذا المعرّف ضمن نطاق العمل الحالي.')).toBeInTheDocument()
  })

  it('keeps the load-failure copy when the read fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatus())),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([])),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/movements`, () => okPageJson([])),
    )
    renderPage(createDeterministicClient())

    expect(await screen.findByText('تعذّر تحميل الأصل')).toBeInTheDocument()
    expect(screen.queryByText('لم يتم العثور على الأصل.')).not.toBeInTheDocument()
  })
})
