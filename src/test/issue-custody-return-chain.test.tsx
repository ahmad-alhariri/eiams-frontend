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
import type {
  AssetCustody,
  SessionResponse,
  StockMovement,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { createPage } from '@/test/msw/factories'
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
const returnedAsset = scenario.assets.returned
const pendingAsset = scenario.assets.pending
const returnedCustody = findCustody(returnedAsset.assetId)
const pendingCustody = findCustody(pendingAsset.assetId)
const issueMovement = findStockMovement(issue, 'Issue')
const returnMovement = findStockMovement(returnDocument, 'Receipt')
const pendingFilters = {
  custodyKind: 'Operational' as const,
  pageIndex: 0,
  pageSize: 10,
  status: 'Active' as const,
}

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
})

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('issue custody and return chain', () => {
  it('keeps the posted issue, custody, return, asset, and stock ledgers exactly traceable', async () => {
    const custodyListQueries: Record<string, string>[] = []
    const assetMovementQueries: Record<string, string>[] = []
    const stockMovementQueries: Record<string, string>[] = []
    useScenarioHandlers(custodyListQueries, assetMovementQueries, stockMovementQueries)

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
      expect(screen.getByRole('link', { name: assetId })).toHaveAttribute(
        'href',
        ROUTE_PATHS.assetDetail.replace(':assetId', assetId),
      )
    }
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()

    await navigate(router, ROUTE_PATHS.custodyPending)

    expect(
      await screen.findByRole('heading', { name: 'الأصول بانتظار التكليف' }),
    ).toBeInTheDocument()
    const pendingRow = screen.getByText(pendingAsset.assetNumber).closest('tr')
    expect(pendingRow).not.toBeNull()
    expect(within(pendingRow as HTMLElement).getByText('مديرية المعلوماتية')).toBeInTheDocument()
    expect(within(pendingRow as HTMLElement).getByText('نشطة')).toBeInTheDocument()
    expect(
      within(pendingRow as HTMLElement).getByRole('button', { name: 'تكليف موظف' }),
    ).toBeEnabled()
    expect(custodyListQueries.at(-1)).toMatchObject({
      custodyKind: 'Operational',
      pageIndex: '0',
      pageSize: '10',
      status: 'Active',
    })

    await navigate(router, assetDetailPath())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تفاصيل الأصل' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`${returnedAsset.assetNumber} — ${scenario.catalog.assetMaterial.nameAr}`),
    ).toBeInTheDocument()
    expect(screen.getByText('في المخزن')).toBeInTheDocument()
    expect(screen.getByText(scenario.warehouses.source.nameAr)).toBeInTheDocument()

    const issuedAssetRow = (await screen.findByText(issue.systemReferenceNumber)).closest('tr')
    const returnedAssetRow = screen.getByText(returnDocument.systemReferenceNumber).closest('tr')
    expect(issuedAssetRow).not.toBeNull()
    expect(returnedAssetRow).not.toBeNull()
    expect(within(issuedAssetRow as HTMLElement).getByText('صرف')).toBeInTheDocument()
    expect(within(returnedAssetRow as HTMLElement).getByText('إرجاع')).toBeInTheDocument()
    expect(assetMovementQueries.at(-1)).toMatchObject({ pageIndex: '0', pageSize: '20' })

    await navigate(router, returnDetailPath())

    const returnHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(returnDocument.systemReferenceNumber),
    })
    expect(returnHeading).toHaveTextContent('تفاصيل سند الإرجاع')
    expect(screen.getByText('إعادة الأصل بعد انتهاء المهمة')).toBeInTheDocument()
    expect(screen.getByText('سند-إرجاع-موقّع.pdf')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: issue.documentId })).toHaveAttribute(
      'href',
      issueDetailPath(),
    )
    expect(screen.getAllByRole('link', { name: returnedAsset.assetId }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()

    await navigate(router, custodyHistoryPath())

    expect(
      await screen.findByRole('heading', { name: 'سجل العهدة غير القابل للتعديل' }),
    ).toBeInTheDocument()
    const custodyRow = screen.getByText('مديرية المعلوماتية').closest('tr')
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
      pageIndex: '0',
      pageSize: '10',
      sortBy: 'PostedAt',
      sortDirection: 'Descending',
    })
  })

  it('isolates issue, asset, and custody reads across Enterprise and Warehouse scopes', async () => {
    const enterpriseScope = { kind: 'enterprise' } as const
    const warehouseScope = {
      kind: 'warehouse',
      id: scenario.warehouses.source.warehouseId,
    } as const
    const warehouseIssue = { ...issue, rowVersion: issue.rowVersion + 1 }
    const warehouseAsset = {
      ...returnedAsset,
      serialNumber: `${returnedAsset.serialNumber}-WH`,
    }
    const warehouseCustody = {
      ...returnedCustody,
      holder: { ...returnedCustody.holder, displayName: 'مديرية المعلوماتية - نطاق المستودع' },
      rowVersion: returnedCustody.rowVersion + 1,
    }
    const warehousePending = {
      ...pendingCustody,
      holder: { ...pendingCustody.holder, displayName: 'مديرية المعلوماتية - نطاق المستودع' },
      rowVersion: pendingCustody.rowVersion + 1,
    }
    let responseScope: 'enterprise' | 'warehouse' = 'enterprise'
    const requestCounts = { asset: 0, custodyList: 0, custodyTimeline: 0, document: 0 }

    server.use(
      http.get(`${environment.apiBaseUrl}/warehouse-documents/${issue.documentId}`, () => {
        requestCounts.document += 1
        return HttpResponse.json(responseScope === 'enterprise' ? issue : warehouseIssue)
      }),
      http.get(`${environment.apiBaseUrl}/assets/${returnedAsset.assetId}`, () => {
        requestCounts.asset += 1
        return HttpResponse.json(responseScope === 'enterprise' ? returnedAsset : warehouseAsset)
      }),
      http.get(`${environment.apiBaseUrl}/assets/${returnedAsset.assetId}/custody`, () => {
        requestCounts.custodyTimeline += 1
        return HttpResponse.json([
          responseScope === 'enterprise' ? returnedCustody : warehouseCustody,
        ])
      }),
      http.get(`${environment.apiBaseUrl}/custodies`, () => {
        requestCounts.custodyList += 1
        return HttpResponse.json(
          createPage([responseScope === 'enterprise' ? pendingCustody : warehousePending]),
        )
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      () => ({
        asset: useAssetQuery(returnedAsset.assetId).data,
        custodyList: useCustodiesQuery(pendingFilters).data,
        custodyTimeline: useAssetCustodyTimelineQuery(returnedAsset.assetId).data,
        document: useDocumentDetailQuery(issue.documentId).data,
      }),
      { wrapper: createQueryWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.document).toEqual(issue)
      expect(result.current.asset).toEqual(returnedAsset)
      expect(result.current.custodyTimeline).toEqual([returnedCustody])
      expect(result.current.custodyList?.items).toEqual([pendingCustody])
    })
    expect(requestCounts).toEqual({ asset: 1, custodyList: 1, custodyTimeline: 1, document: 1 })

    responseScope = 'warehouse'
    activeScope.key = warehouseScope
    rerender()

    await waitFor(() => {
      expect(result.current.document).toEqual(warehouseIssue)
      expect(result.current.asset).toEqual(warehouseAsset)
      expect(result.current.custodyTimeline).toEqual([warehouseCustody])
      expect(result.current.custodyList?.items).toEqual([warehousePending])
    })
    expect(requestCounts).toEqual({ asset: 2, custodyList: 2, custodyTimeline: 2, document: 2 })
    expect(
      client.getQueryData(documentQueryKeys.document(enterpriseScope, issue.documentId)),
    ).toEqual(issue)
    expect(
      client.getQueryData(documentQueryKeys.document(warehouseScope, issue.documentId)),
    ).toEqual(warehouseIssue)
    expect(
      client.getQueryData(assetQueryKeys.asset(enterpriseScope, returnedAsset.assetId)),
    ).toEqual(returnedAsset)
    expect(
      client.getQueryData(assetQueryKeys.asset(warehouseScope, returnedAsset.assetId)),
    ).toEqual(warehouseAsset)
    expect(
      client.getQueryData(assetQueryKeys.custody(enterpriseScope, returnedAsset.assetId)),
    ).toEqual([returnedCustody])
    expect(
      client.getQueryData(assetQueryKeys.custody(warehouseScope, returnedAsset.assetId)),
    ).toEqual([warehouseCustody])
    expect(
      client.getQueryData(custodyQueryKeys.custodies(enterpriseScope, pendingFilters)),
    ).toEqual(createPage([pendingCustody]))
    expect(client.getQueryData(custodyQueryKeys.custodies(warehouseScope, pendingFilters))).toEqual(
      createPage([warehousePending]),
    )
  })
})

function readSession(): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'cross.module.reviewer',
      displayName: 'مراجع التكامل',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: ['asset.view', 'custody.assign', 'document.view', 'inventory.view'],
    availableScopes: [
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'المؤسسة',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
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
        : HttpResponse.json(document)
    }),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId/history`, ({ params }) => {
      const document = documents.find((candidate) => candidate.documentId === params['documentId'])
      const events =
        document === undefined ? undefined : scenario.ledgers.lifecycleEvents[document.documentId]
      return document === undefined || events === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json({
            documentId: document.documentId,
            currentStatus: document.documentStatus,
            currentRowVersion: document.rowVersion,
            events,
          })
    }),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId/policy`, ({ params }) => {
      const document = documents.find((candidate) => candidate.documentId === params['documentId'])
      return document === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(document.policy)
    }),
    http.get(`${environment.apiBaseUrl}/custodies`, ({ request }) => {
      const searchParams = new URL(request.url).searchParams
      custodyListQueries.push(Object.fromEntries(searchParams))
      const custodyKind = searchParams.get('custodyKind')
      const status = searchParams.get('status')
      const search = searchParams.get('search')?.toLowerCase()
      const rows = scenario.ledgers.custodies.filter(
        (custody) =>
          (custodyKind === null || custody.custodyKind === custodyKind) &&
          (status === null || custody.status === status) &&
          (search === undefined ||
            custody.holder.displayName.toLowerCase().includes(search) ||
            ('assetNumber' in custody && custody.assetNumber.toLowerCase().includes(search))),
      )
      return HttpResponse.json(createPage(rows))
    }),
    http.get(`${environment.apiBaseUrl}/assets/:assetId`, ({ params }) => {
      const asset = Object.values(scenario.assets).find(
        (candidate) => candidate.assetId === params['assetId'],
      )
      return asset === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(asset)
    }),
    http.get(`${environment.apiBaseUrl}/assets/:assetId/custody`, ({ params }) =>
      HttpResponse.json(
        scenario.ledgers.custodies.filter((custody) => custody.assetId === params['assetId']),
      ),
    ),
    http.get(`${environment.apiBaseUrl}/assets/:assetId/movements`, ({ params, request }) => {
      assetMovementQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(
        createPage(
          scenario.ledgers.assetMovements.filter(
            (movement) => movement.assetId === params['assetId'],
          ),
        ),
      )
    }),
    http.get(`${environment.apiBaseUrl}/inventory/movements`, ({ request }) => {
      stockMovementQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(createPage(stockMovements, { pageIndex: 0, pageSize: 10 }))
    }),
  )
}

function findCustody(assetId: string): AssetCustody {
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
  return ROUTE_PATHS.assetDetail.replace(':assetId', returnedAsset.assetId)
}

function custodyHistoryPath() {
  return ROUTE_PATHS.assetCustodyHistory.replace(':assetId', returnedAsset.assetId)
}

async function navigate(router: ReturnType<typeof createMemoryRouter>, path: string) {
  await act(async () => {
    await router.navigate(path)
  })
}
