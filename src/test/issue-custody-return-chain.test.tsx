import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { environment } from '@/config/env'
import { ROUTE_PATHS } from '@/config/routes'
import { toRouteObject } from '@/config/route-registry'
import {
  assetQueryKeys,
  useAssetCustodyTimelineQuery,
  useAssetQuery,
} from '@/modules/asset/hooks/use-asset-queries'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { custodyQueryKeys, useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { documentQueryKeys, useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import { toArabicDigits } from '@/shared/utils/format'
import type {
  Asset,
  AssetCustodyTimelineRow,
  AssetDetails,
} from '@/modules/asset/types/asset.types'
import type { PendingCustody } from '@/modules/custody/types/custody.types'
import type { WarehouseDocument } from '@/test/msw/document-engine.types'
import type { StockMovement } from '@/modules/inventory/types/inventory.api-types'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'
import { wireDocumentDetails, wireDocumentHistory } from '@/test/msw/document-wire-fixtures'
import { apiJson, okPageJson } from '@/test/msw/envelope'
import { toWirePolicy } from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as ScopeCacheKey | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const scenario = createCrossModuleScenario()
const issue = scenario.documents.issue
const returnDocument = scenario.documents.return
// The document engine answers the handwritten wire contract, not the in-memory
// snapshot the scenario keeps: the petals carry a recipient id rather than a
// reference object, the issued assets travel on `lines[].selectedAssets`, and
// `postedBy` is a user id. Serving the projection is what keeps this journey
// honest about what the live routes return.
const issueWire = wireDocumentDetails(issue)
const returnedAsset = scenario.assets.returned
const pendingAsset = scenario.assets.pending
const returnedCustody = findCustody(returnedAsset.id)
const pendingCustody = findCustody(pendingAsset.id)

/**
 * The asset detail endpoint serves the live wire row (`AssetDetails`): the flat
 * list row plus the detail-only members. The scenario already mints the live
 * flat row, so only the detail-only members are added here.
 */
function toAssetDetails(asset: Asset): AssetDetails {
  return {
    ...asset,
    materialNameEn: null,
    custodyKind: null,
    latestMovementType: null,
    latestMovementAtUtc: null,
    receiptLineId: null,
    receiptDocumentId: null,
    receiptDocumentReference: null,
  }
}

/**
 * The live `GET /custodies/pending` row (`PendingCustodyResponse`).
 *
 * It carries the asset number and the material id — neither of which the
 * custody-timeline row has — so those two travel in from the asset.
 */
function toPendingCustody(
  custody: AssetCustodyTimelineRow,
  assetNumber: string,
  materialId: string,
): PendingCustody {
  return {
    custodyId: custody.custodyId,
    assetId: custody.assetId,
    assetNumber,
    materialId,
    holderType: custody.holderType,
    holderId: custody.holderId,
    issueDocumentId: custody.issueDocumentId,
    fromUtc: custody.fromUtc,
    rowVersion: custody.rowVersion,
  }
}

const returnedTimelineRow = returnedCustody
const issueMovement = findStockMovement(issue, 'Issue')
const returnMovement = findStockMovement(returnDocument, 'Receipt')
const pendingFilters = {
  page: 1,
  pageSize: 10,
  subjectType: 'Asset' as const,
  status: 'Active' as const,
}

/**
 * The hook below transforms seven lazy page graphs before a single assertion
 * runs. Under full-suite parallel load that transform outlasts Vitest's DEFAULT
 * 10 s `hookTimeout` and the file fails with "Hook timed out in 10000ms", so
 * the budget is scoped to THIS hook.
 */
const WARM_LAZY_ROUTES_TIMEOUT = 60_000

beforeAll(async () => {
  await Promise.all([
    import('@/modules/issue/pages/issue-document-detail-page'),
    import('@/modules/custody/pages/return-document-detail-page'),
    import('@/shared/documents/pages/document-detail-page'),
    import('@/modules/custody/pages/pending-custody-list-page'),
    import('@/modules/asset/pages/asset-detail-page'),
    import('@/modules/asset/pages/asset-custody-history-page'),
    import('@/modules/inventory/pages/stock-movements-page'),
  ])
}, WARM_LAZY_ROUTES_TIMEOUT)

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('issue custody and return chain', () => {
  it('keeps the posted issue, custody, return, asset, and stock ledgers exactly traceable', async () => {
    const custodyListQueries: Record<string, string>[] = []
    const pendingQueries: Record<string, string>[] = []
    const assetMovementQueries: Record<string, string>[] = []
    const stockMovementQueries: Record<string, string>[] = []
    useScenarioHandlers(custodyListQueries, assetMovementQueries, stockMovementQueries)

    // The shared scenario handlers predate the timeline rename, so the
    // custody-timeline read is served here, in this file, on the live path.
    server.use(
      http.get(`${environment.apiBaseUrl}/assets/${returnedAsset.id}/custody-timeline`, () =>
        apiJson([returnedTimelineRow]),
      ),
      // The pending queue is served by the live warehouse-scoped endpoint.
      http.get(`${environment.apiBaseUrl}/custodies/pending`, ({ request }) => {
        pendingQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([
          toPendingCustody(pendingCustody, pendingAsset.assetNumber, pendingAsset.materialId),
        ])
      }),
    )

    const router = renderJourney(issueDetailPath())

    const issueHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(issue.systemReferenceNumber),
    })
    expect(issueHeading).toHaveTextContent('تفاصيل سند الصرف')
    expect(screen.getByText('مديرية المعلوماتية')).toBeInTheDocument()
    expect(screen.getByText('تسليم حاسوب للعمل الميداني')).toBeInTheDocument()
    expect(screen.getByText('سند-صرف-موقّع.pdf')).toBeInTheDocument()
    for (const assetId of issue.lines[0]?.issuedAssetIds ?? []) {
      // The issued assets travel on the wire line's `selectedAssets`, and the
      // lines table renders each id in the app-wide Arabic-Indic digits.
      expect(screen.getByRole('link', { name: toArabicDigits(assetId) })).toHaveAttribute(
        'href',
        ROUTE_PATHS.assetDetail.replace(':assetId', assetId),
      )
    }
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()

    // The pending queue is WAREHOUSE-scoped on the server: the live endpoint
    // binds a non-nullable warehouse id, so the journey runs it in the
    // keeper's warehouse scope — the scope the assignment flow lives in.
    activeScope.key = { kind: 'warehouse', id: scenario.warehouses.source.id }
    await navigate(router, ROUTE_PATHS.custodyPending)

    expect(
      await screen.findByRole('heading', { name: 'الأصول بانتظار التكليف' }),
    ).toBeInTheDocument()
    const pendingRow = screen.getByText(pendingAsset.assetNumber).closest('tr')
    expect(pendingRow).not.toBeNull()
    // The live pending row carries the holder TYPE and ID — no display name.
    expect(
      within(pendingRow as HTMLElement).getByText(
        `${pendingCustody.holderType}:${pendingCustody.holderId}`,
      ),
    ).toBeInTheDocument()
    expect(
      within(pendingRow as HTMLElement).getByRole('button', { name: 'تكليف موظف' }),
    ).toBeEnabled()
    expect(pendingQueries.at(-1)).toMatchObject({
      warehouseId: scenario.warehouses.source.id,
      page: '1',
      pageSize: '10',
    })
    activeScope.key = { kind: 'enterprise' }

    await navigate(router, assetDetailPath())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تفاصيل الأصل' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`${returnedAsset.assetNumber} — ${scenario.catalog.assetMaterial.nameAr}`),
    ).toBeInTheDocument()
    expect(screen.getByText('في المخزن')).toBeInTheDocument()
    expect(screen.getByText(scenario.warehouses.source.name)).toBeInTheDocument()

    const issuedAssetRow = (await screen.findByText(issue.systemReferenceNumber)).closest('tr')
    const returnedAssetRow = screen.getByText(returnDocument.systemReferenceNumber).closest('tr')
    expect(issuedAssetRow).not.toBeNull()
    expect(returnedAssetRow).not.toBeNull()
    expect(within(issuedAssetRow as HTMLElement).getByText('صرف')).toBeInTheDocument()
    expect(within(returnedAssetRow as HTMLElement).getByText('إرجاع')).toBeInTheDocument()
    // The movement ledger now shares the app-wide server pagination, so the
    // page size is the shared default (10), and the wire page is ONE-based.
    expect(assetMovementQueries.at(-1)).toMatchObject({ page: '1', pageSize: '10' })

    await navigate(router, returnDetailPath())

    const returnHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(returnDocument.systemReferenceNumber),
    })
    expect(returnHeading).toHaveTextContent('تفاصيل سند الإرجاع')
    expect(screen.getByText('إعادة الأصل بعد انتهاء المهمة')).toBeInTheDocument()
    expect(screen.getByText('سند-إرجاع-موقّع.pdf')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: new RegExp(issue.systemReferenceNumber) }),
    ).toHaveAttribute('href', issueDetailPath())
    expect(
      screen.getAllByRole('link', { name: toArabicDigits(returnedAsset.id) }).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()

    await navigate(router, custodyHistoryPath())

    expect(
      await screen.findByRole('heading', { name: 'سجل العهدة غير القابل للتعديل' }),
    ).toBeInTheDocument()
    // The live timeline wire carries holderType + holderId only (no display
    // name), rendered by the history page as a wire-value cell.
    const custodyRow = screen
      .getByText(`${returnedTimelineRow.holderType}:${returnedTimelineRow.holderId}`)
      .closest('tr')
    expect(custodyRow).not.toBeNull()
    expect(within(custodyRow as HTMLElement).getByText('حفظ تشغيلي')).toBeInTheDocument()
    expect(within(custodyRow as HTMLElement).getByText('مغلقة')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تحويل|تكليف|حذف|تعديل/ })).not.toBeInTheDocument()

    await navigate(router, ROUTE_PATHS.inventoryMovements)

    expect(await screen.findByRole('heading', { name: 'حركات المخزون' })).toBeInTheDocument()
    const issuedStockRow = screen.getByText(issue.systemReferenceNumber).closest('tr')
    const returnedStockRow = screen.getByText(returnDocument.systemReferenceNumber).closest('tr')
    expect(issuedStockRow).not.toBeNull()
    expect(returnedStockRow).not.toBeNull()
    expect(within(issuedStockRow as HTMLElement).getByText('صرف')).toBeInTheDocument()
    expect(within(issuedStockRow as HTMLElement).getByText('-٢')).toBeInTheDocument()
    expect(within(returnedStockRow as HTMLElement).getByText('استلام')).toBeInTheDocument()
    expect(within(returnedStockRow as HTMLElement).getByText('+١')).toBeInTheDocument()
    expect(stockMovementQueries.at(-1)).toMatchObject({
      page: '1',
      pageSize: '10',
      sortBy: 'PostedAt',
      sortDirection: 'Descending',
    })
  })

  it('isolates issue, asset, and custody reads across Enterprise and Warehouse scopes', async () => {
    const enterpriseScope = { kind: 'enterprise' } as const
    const warehouseScope = {
      kind: 'warehouse',
      id: scenario.warehouses.source.id,
    } as const
    const warehouseIssue = { ...issue, rowVersion: issue.rowVersion + 1 }
    // One projection per scope variant, so the cache comparison below asserts
    // the wire shape the handler served for that scope.
    const warehouseIssueWire = wireDocumentDetails(warehouseIssue)
    const warehouseAsset = {
      ...returnedAsset,
      serialNumber: `${returnedAsset.serialNumber}-WH`,
    }
    const warehouseCustody = {
      ...returnedTimelineRow,
      rowVersion: returnedTimelineRow.rowVersion + 1,
    }
    const warehousePending = {
      ...pendingCustody,
      rowVersion: pendingCustody.rowVersion + 1,
    }
    let responseScope: 'enterprise' | 'warehouse' = 'enterprise'
    const requestCounts = { asset: 0, custodyList: 0, custodyTimeline: 0, document: 0 }

    server.use(
      http.get(`${environment.apiBaseUrl}/warehouse-documents/${issue.documentId}`, () => {
        requestCounts.document += 1
        return apiJson(responseScope === 'enterprise' ? issueWire : warehouseIssueWire)
      }),
      http.get(`${environment.apiBaseUrl}/assets/${returnedAsset.id}`, () => {
        requestCounts.asset += 1
        return apiJson(responseScope === 'enterprise' ? returnedAsset : warehouseAsset)
      }),
      http.get(`${environment.apiBaseUrl}/assets/${returnedAsset.id}/custody-timeline`, () => {
        requestCounts.custodyTimeline += 1
        return apiJson([responseScope === 'enterprise' ? returnedTimelineRow : warehouseCustody])
      }),
      http.get(`${environment.apiBaseUrl}/custodies`, () => {
        requestCounts.custodyList += 1
        return okPageJson([responseScope === 'enterprise' ? pendingCustody : warehousePending])
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      () => ({
        asset: useAssetQuery(returnedAsset.id).data,
        custodyList: useCustodiesQuery(pendingFilters).data,
        custodyTimeline: useAssetCustodyTimelineQuery(returnedAsset.id).data,
        document: useDocumentDetailQuery(issue.documentId).data,
      }),
      { wrapper: createQueryWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.document).toEqual(issueWire)
      expect(result.current.asset).toEqual(returnedAsset)
      expect(result.current.custodyTimeline).toEqual([returnedTimelineRow])
      expect(result.current.custodyList?.items).toEqual([pendingCustody])
    })
    expect(requestCounts).toEqual({ asset: 1, custodyList: 1, custodyTimeline: 1, document: 1 })

    responseScope = 'warehouse'
    activeScope.key = warehouseScope
    rerender()

    await waitFor(() => {
      expect(result.current.document).toEqual(warehouseIssueWire)
      expect(result.current.asset).toEqual(warehouseAsset)
      expect(result.current.custodyTimeline).toEqual([warehouseCustody])
      expect(result.current.custodyList?.items).toEqual([warehousePending])
    })
    expect(requestCounts).toEqual({ asset: 2, custodyList: 2, custodyTimeline: 2, document: 2 })
    expect(
      client.getQueryData(documentQueryKeys.document(enterpriseScope, issue.documentId)),
    ).toEqual(issueWire)
    expect(
      client.getQueryData(documentQueryKeys.document(warehouseScope, issue.documentId)),
    ).toEqual(warehouseIssueWire)
    expect(client.getQueryData(assetQueryKeys.asset(enterpriseScope, returnedAsset.id))).toEqual(
      returnedAsset,
    )
    expect(client.getQueryData(assetQueryKeys.asset(warehouseScope, returnedAsset.id))).toEqual(
      warehouseAsset,
    )
    expect(client.getQueryData(assetQueryKeys.custody(enterpriseScope, returnedAsset.id))).toEqual([
      returnedTimelineRow,
    ])
    expect(client.getQueryData(assetQueryKeys.custody(warehouseScope, returnedAsset.id))).toEqual([
      warehouseCustody,
    ])
    expect(
      client.getQueryData(custodyQueryKeys.custodies(enterpriseScope, pendingFilters)),
    ).toMatchObject({ items: [pendingCustody] })
    expect(
      client.getQueryData(custodyQueryKeys.custodies(warehouseScope, pendingFilters)),
    ).toMatchObject({ items: [warehousePending] })
  })
})

function readSession(): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مراجع التكامل' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: ['asset.view', 'custody.assign', 'document.view', 'inventory.view'],
  }
}

function renderJourney(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, readSession())
  const router = createMemoryRouter(
    [
      toRouteObject('documentIssueDetail'),
      toRouteObject('documentReturnDetail'),
      toRouteObject('custodyPending'),
      toRouteObject('assetDetail'),
      toRouteObject('assetCustodyHistory'),
      toRouteObject('inventoryMovements'),
    ],
    { initialEntries: [initialEntry] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouteSuspense>
        <RouterProvider router={router} />
      </RouteSuspense>
    </QueryClientProvider>,
  )

  return router
}

function createQueryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function useScenarioHandlers(
  custodyListQueries: Record<string, string>[],
  assetMovementQueries: Record<string, string>[],
  stockMovementQueries: Record<string, string>[],
) {
  const documents = [issue, returnDocument]
  const stockMovements = [issueMovement, returnMovement]

  server.use(
    http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId`, ({ params }) => {
      const document = documents.find((candidate) => candidate.documentId === params['documentId'])
      return document === undefined
        ? new HttpResponse(null, { status: 404 })
        : apiJson(wireDocumentDetails(document))
    }),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId/history`, ({ params }) => {
      const document = documents.find((candidate) => candidate.documentId === params['documentId'])
      const events =
        document === undefined ? undefined : scenario.ledgers.lifecycleEvents[document.documentId]
      // An absent chain stays a 404 rather than an empty envelope: the timeline
      // is audit evidence, and a read that silently loses it is a defect.
      return document === undefined || events === undefined
        ? new HttpResponse(null, { status: 404 })
        : apiJson(
            wireDocumentHistory(events, {
              documentId: document.documentId,
              currentStatus: document.documentStatus,
              currentRowVersion: document.rowVersion,
            }),
          )
    }),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId/policy`, ({ params }) => {
      const document = documents.find((candidate) => candidate.documentId === params['documentId'])
      return document === undefined
        ? new HttpResponse(null, { status: 404 })
        : apiJson(toWirePolicy(document))
    }),
    http.get(`${environment.apiBaseUrl}/custodies`, ({ request }) => {
      const searchParams = new URL(request.url).searchParams
      custodyListQueries.push(Object.fromEntries(searchParams))
      const status = searchParams.get('status')
      const rows = scenario.ledgers.custodies.filter(
        (custody) => status === null || custody.status === status,
      )
      return okPageJson(rows)
    }),
    http.get(`${environment.apiBaseUrl}/assets/:assetId`, ({ params }) => {
      const asset = Object.values(scenario.assets).find(
        (candidate) => candidate.id === params['assetId'],
      )
      return asset === undefined
        ? new HttpResponse(null, { status: 404 })
        : apiJson(toAssetDetails(asset))
    }),
    http.get(`${environment.apiBaseUrl}/assets/:assetId/current-status`, ({ params }) => {
      const asset = Object.values(scenario.assets).find(
        (candidate) => candidate.id === params['assetId'],
      )
      return asset === undefined
        ? new HttpResponse(null, { status: 404 })
        : apiJson({
            assetId: asset.id,
            materialId: asset.materialId,
            warehouseId: asset.warehouseId,
            assetNumber: asset.assetNumber,
            serialNumber: asset.serialNumber,
            currentStatus: asset.currentStatus,
            activeCustodyId: null,
            holderType: null,
            holderId: null,
            custodyKind: null,
            latestMovementType: null,
            latestMovementAtUtc: null,
          })
    }),
    http.get(`${environment.apiBaseUrl}/assets/:assetId/custody-timeline`, ({ params }) =>
      apiJson(
        scenario.ledgers.custodies.filter((custody) => custody.assetId === params['assetId']),
      ),
    ),
    http.get(`${environment.apiBaseUrl}/assets/:assetId/movements`, ({ params, request }) => {
      assetMovementQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return okPageJson(
        scenario.ledgers.assetMovements.filter(
          (movement) => movement.assetId === params['assetId'],
        ),
      )
    }),
    http.get(`${environment.apiBaseUrl}/inventory/movements`, ({ request }) => {
      stockMovementQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return okPageJson(stockMovements, { page: 1, pageSize: 10 })
    }),
  )
}

function findCustody(assetId: string): AssetCustodyTimelineRow {
  const custody = scenario.ledgers.custodies.find((candidate) => candidate.assetId === assetId)
  if (custody === undefined) throw new Error(`Missing custody for asset ${assetId}`)
  return custody
}

function findStockMovement(
  document: WarehouseDocument,
  movementType: StockMovement['movementType'],
): StockMovement {
  const movement = scenario.ledgers.stockMovements.find(
    (candidate) =>
      candidate.documentId === document.documentId && candidate.movementType === movementType,
  )
  if (movement === undefined) {
    throw new Error(`Missing ${movementType} movement for document ${document.documentId}`)
  }
  return movement
}

function issueDetailPath() {
  return ROUTE_PATHS.documentIssueDetail.replace(':documentId', issue.documentId)
}

function returnDetailPath() {
  return ROUTE_PATHS.documentReturnDetail.replace(':documentId', returnDocument.documentId)
}

function assetDetailPath() {
  return ROUTE_PATHS.assetDetail.replace(':assetId', returnedAsset.id)
}

function custodyHistoryPath() {
  return ROUTE_PATHS.assetCustodyHistory.replace(':assetId', returnedAsset.id)
}

async function navigate(router: ReturnType<typeof createMemoryRouter>, path: string) {
  await act(async () => {
    await router.navigate(path)
  })
}
