import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { toRouteObject } from '@/config/route-registry'
import { ROUTE_PATHS } from '@/config/routes'
import {
  useAssetQuery,
  useAssetCustodyTimelineQuery,
  useAssetMovementsQuery,
} from '@/modules/asset/hooks/use-asset-queries'
import { useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { RouteAccessGuard } from '@/modules/auth/components/route-guards'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import {
  useInventoryBalanceQuery,
  useStockMovementsQuery,
} from '@/modules/inventory/hooks/use-inventory-queries'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import type {
  AdjustmentPostResult,
  Asset,
  AssetCustody,
  InventoryAdjustment,
  StockMovement,
} from '@/shared/types/generated/eiams-v1'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { createDocumentPolicy, createPage, createSession } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))
vi.mock('@/shared/ui/toast-manager', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/warehouse/hooks/use-scoped-warehouse-selector', () => ({
  useScopedWarehouseSelector: () => ({ scopeReady: true, loadOptions: async () => [] }),
}))
vi.mock('@/modules/catalog/hooks/use-scoped-material-selector', () => ({
  useScopedMaterialSelector: () => ({ scopeReady: true, loadOptions: async () => [] }),
}))

const scenario = createCrossModuleScenario()
const count = scenario.adjustments.count
const adjustment = scenario.adjustments.countVariance
const disposal = scenario.adjustments.disposal
const manager = [
  'document.view',
  'document.create',
  'document.post',
  'document.reverse',
  'count.view',
  'inventory.view',
  'asset.view',
]

afterEach(() => {
  useAuthSessionStore.setState({ status: 'initializing' })
})

beforeAll(async () => {
  await Promise.all([
    import('@/modules/inventory-count/pages/count-detail-page'),
    import('@/modules/adjustment/pages/adjustment-draft-form-page'),
    import('@/modules/adjustment/pages/adjustment-detail-page'),
    import('@/modules/adjustment/pages/adjustments-list-page'),
    import('@/modules/asset/pages/asset-detail-page'),
  ])
})

function setupJourney(path: string, permissions = manager) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, createSession({ permissionCodes: permissions }))
  useAuthSessionStore.setState({ status: 'authenticated' })
  const router = createMemoryRouter(
    (
      [
        'countDetail',
        'adjustmentNew',
        'assetDisposalNew',
        'adjustments',
        'adjustmentDetail',
        'assetDetail',
      ] as const
    ).map((routeKey) => {
      const route = toRouteObject(routeKey)
      return {
        ...route,
        element: <RouteAccessGuard route={routeKey}>{route.element}</RouteAccessGuard>,
      }
    }),
    { initialEntries: [path] },
  )
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <RouteSuspense>
        <RouterProvider router={router} />
      </RouteSuspense>
    </Wrapper>,
  )
  return { router, client, wrapper: Wrapper, user: userEvent.setup() }
}

function detailPath(value: InventoryAdjustment) {
  return ROUTE_PATHS.adjustmentDetail.replace(':adjustmentId', value.adjustmentId)
}

function draftOf(value: InventoryAdjustment, signed = true): InventoryAdjustment {
  return {
    ...value,
    status: 'Draft',
    postedAt: null,
    rowVersion: 1,
    attachments: signed ? (value.attachments ?? []) : [],
    policy: createDocumentPolicy({
      documentId: value.documentId,
      documentStatus: 'Draft',
      rowVersion: 1,
      policyKind: value.purpose === 'Disposal' ? 'Disposal' : 'Adjustment',
      signedOriginalSatisfied: signed,
      blockers: signed
        ? []
        : [
            {
              code: 'document.signed_original_missing',
              messageAr: 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.',
            },
          ],
      actions: [
        {
          action: 'Post',
          allowed: signed,
          presentation: signed ? 'Enabled' : 'Disabled',
          reasonRequired: false,
          confirmationRequired: false,
        },
      ],
    }),
  }
}

function postResult(
  value: InventoryAdjustment,
  stockMovements: readonly StockMovement[],
): AdjustmentPostResult {
  const lifecycleEvent = scenario.ledgers.lifecycleEvents[value.documentId]?.at(-1)
  if (!lifecycleEvent) throw new Error('Missing posted lifecycle fixture')
  return { adjustment: value, stockMovements, assetMovements: [], lifecycleEvent }
}

function countHandlers() {
  server.use(
    http.get(`*/api/v1/inventory-counts/${count.countId}`, () => HttpResponse.json(count)),
    http.get(`*/api/v1/inventory-counts/${count.countId}/lines`, () =>
      HttpResponse.json(createPage(scenario.adjustments.countLines)),
    ),
  )
}

describe('count adjustment and disposal chain', () => {
  it.each([ROUTE_PATHS.adjustmentNew, ROUTE_PATHS.assetDisposalNew])(
    'denies keeper direct navigation to %s through the real route guard',
    async (path) => {
      setupJourney(path, ['document.view', 'document.create'])
      expect(
        await screen.findByRole('heading', { name: 'ليست لديك صلاحية الوصول' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /حفظ/ })).not.toBeInTheDocument()
    },
  )

  it('preserves count variance through draft creation and posting, then refetches the stock projections', async () => {
    countHandlers()
    const balance = scenario.ledgers.balances.find(
      (row) =>
        row.material.id === scenario.catalog.consumableMaterial.materialId &&
        row.warehouse.id === count.warehouse.id,
    )!
    const movement = scenario.ledgers.stockMovements.find(
      (row) => row.documentId === adjustment.documentId,
    )!
    const draft = draftOf(adjustment)
    // Predetermined server responses, not a client-side ledger/transaction simulator.
    let posted = false
    const creates: unknown[] = []
    const posts: { body: unknown; key: string | null }[] = []
    server.use(
      http.post('*/api/v1/adjustments', async ({ request }) => {
        creates.push(await request.json())
        return HttpResponse.json(draft, { status: 201 })
      }),
      http.get('*/api/v1/adjustments', () =>
        HttpResponse.json(createPage([posted ? adjustment : draft])),
      ),
      http.get(`*/api/v1/adjustments/${adjustment.adjustmentId}`, () =>
        HttpResponse.json(posted ? adjustment : draft),
      ),
      http.post(`*/api/v1/adjustments/${adjustment.adjustmentId}/post`, async ({ request }) => {
        posts.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        posted = true
        return HttpResponse.json<AdjustmentPostResult>(postResult(adjustment, [movement]))
      }),
      http.get(`*/api/v1/inventory/balances/${balance.balanceId}`, () =>
        HttpResponse.json(posted ? balance : { ...balance, quantity: 7 }),
      ),
      http.get('*/api/v1/inventory/movements', () =>
        HttpResponse.json(createPage(posted ? [movement] : [])),
      ),
    )
    const journey = setupJourney(ROUTE_PATHS.countDetail.replace(':countId', count.countId))
    const projections = renderHook(
      () => ({
        balance: useInventoryBalanceQuery(balance.balanceId),
        movements: useStockMovementsQuery({ documentId: adjustment.documentId }),
      }),
      { wrapper: journey.wrapper },
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: new RegExp(count.referenceNumber) }),
    ).toBeInTheDocument()
    await waitFor(() => expect(projections.result.current.balance.data?.quantity).toBe(7))
    expect(projections.result.current.movements.data?.items).toEqual([])
    expect(creates).toHaveLength(0)
    await journey.user.click(screen.getByRole('link', { name: 'إنشاء سند تسوية لفروقات الجلسة' }))
    expect(await screen.findByLabelText('مستودع التسوية')).toHaveValue(count.warehouse.displayName)
    expect(screen.getByLabelText('مستودع التسوية')).toBeDisabled()
    await journey.user.type(screen.getByLabelText('سبب التسوية'), adjustment.reason)
    await journey.user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      warehouseId: count.warehouse.id,
      countId: count.countId,
      purpose: 'CountVariance',
      lines: [
        {
          materialId: scenario.adjustments.countLines[0]!.material.id,
          quantityDelta: 2,
          reason: scenario.adjustments.countLines[0]!.reason,
        },
      ],
    })
    expect(posts).toHaveLength(0)
    expect(projections.result.current.balance.data?.quantity).toBe(7)
    await journey.user.click(
      await screen.findByRole('link', { name: adjustment.documentReference }),
    )
    expect(await screen.findByText(count.referenceNumber)).toBeInTheDocument()
    expect(screen.getByText(adjustment.attachments![0]!.originalFilename)).toBeInTheDocument()
    await journey.user.click(screen.getByRole('button', { name: 'ترحيل السند' }))
    await waitFor(() => expect(projections.result.current.balance.data).toEqual(balance))
    await waitFor(() =>
      expect(projections.result.current.movements.data?.items).toEqual([movement]),
    )
    expect(posts).toEqual([{ body: { rowVersion: 1 }, key: expect.any(String) }])
    expect(posts[0]!.key).not.toBe('')
    expect(await screen.findByText('مرحّل')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إرسال|ترحيل السند/ })).not.toBeInTheDocument()
    expect(movement).toMatchObject({
      documentId: adjustment.documentId,
      documentLineId: scenario.documents.adjustment.lines[0]!.lineId,
      material: { id: adjustment.lines[0]!.material.id },
      quantityDelta: 2,
      movementType: 'AdjustmentIn',
      postedAt: adjustment.postedAt,
    })
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('blocks posting without a signed original, and hides it from keepers despite an enabled policy', async () => {
    const post = vi.fn()
    server.use(
      http.get(`*/api/v1/adjustments/${adjustment.adjustmentId}`, () =>
        HttpResponse.json(draftOf(adjustment, false)),
      ),
      http.post(`*/api/v1/adjustments/${adjustment.adjustmentId}/post`, post),
    )
    const journey = setupJourney(detailPath(adjustment))
    const button = await screen.findByRole('button', { name: 'ترحيل السند' })
    expect(button).toBeDisabled()
    expect(
      screen.getAllByText('يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.').length,
    ).toBeGreaterThan(0)
    await journey.user.click(button)
    expect(post).not.toHaveBeenCalled()
    server.use(
      http.get(`*/api/v1/adjustments/${adjustment.adjustmentId}`, () =>
        HttpResponse.json(draftOf(adjustment)),
      ),
    )
    await act(async () => {
      journey.client.setQueryData(
        authSessionQueryKey,
        createSession({ permissionCodes: ['document.view', 'document.create'] }),
      )
      await journey.client.invalidateQueries()
    })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'ترحيل السند' })).not.toBeInTheDocument(),
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('recovers when the count variance seed cannot be loaded', async () => {
    countHandlers()
    server.use(
      http.get(
        `*/api/v1/inventory-counts/${count.countId}/lines`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    const journey = setupJourney(
      `${ROUTE_PATHS.adjustmentNew}?countId=${count.countId}&purpose=CountVariance&warehouseId=${count.warehouse.id}`,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل بيانات الجرد')
    expect(screen.queryByRole('button', { name: 'حفظ المسودة' })).not.toBeInTheDocument()
    countHandlers()
    await journey.user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByRole('button', { name: 'حفظ المسودة' })).toBeEnabled()
  })

  it.each(['InStock', 'Issued'] as const)(
    'refreshes terminal disposal and custody projections for an %s asset without double deduction',
    async (status) => {
      const issued = status === 'Issued'
      const originalAsset = issued
        ? scenario.assets.pending
        : { ...scenario.assets.disposed, derivedStatus: 'InStock' as const }
      const disposedAsset: Asset = {
        assetId: originalAsset.assetId,
        assetNumber: originalAsset.assetNumber,
        material: originalAsset.material,
        receiptLineId: originalAsset.receiptLineId!,
        derivedStatus: 'Disposed',
        rowVersion: originalAsset.rowVersion + 1,
      }
      const postedAdjustment: InventoryAdjustment = {
        ...disposal,
        lines: disposal.lines.map((line) => ({
          ...line,
          assetId: originalAsset.assetId,
          assetNumber: originalAsset.assetNumber,
        })),
      }
      const stockRows = issued
        ? []
        : scenario.ledgers.stockMovements.filter((row) => row.documentId === disposal.documentId)
      const balance = scenario.ledgers.balances.find(
        (row) => row.material.id === originalAsset.material.id,
      )!
      const activeCustody = scenario.ledgers.custodies.find(
        (row) => row.assetId === originalAsset.assetId && row.status === 'Active',
      )
      const closedCustodies: AssetCustody[] = activeCustody
        ? [{ ...activeCustody, status: 'Closed', toTs: disposal.postedAt! }]
        : []
      const existingEvents = scenario.ledgers.assetMovements.filter(
        (row) => row.assetId === originalAsset.assetId && row.eventType !== 'Disposed',
      )
      const disposedEvent = {
        ...scenario.ledgers.assetMovements.find((row) => row.eventType === 'Disposed')!,
        assetId: originalAsset.assetId,
        ...(activeCustody ? { custodyId: activeCustody.custodyId } : {}),
      }
      const response: AdjustmentPostResult = {
        ...postResult(postedAdjustment, stockRows),
        affectedAsset: disposedAsset,
        assetMovements: [disposedEvent],
        ...(activeCustody ? { closedCustodyId: activeCustody.custodyId } : {}),
      }
      let posted = false
      const posts: unknown[] = []
      server.use(
        http.get(`*/api/v1/adjustments/${disposal.adjustmentId}`, () =>
          HttpResponse.json(posted ? postedAdjustment : draftOf(postedAdjustment)),
        ),
        http.post(`*/api/v1/adjustments/${disposal.adjustmentId}/post`, async ({ request }) => {
          posts.push(await request.json())
          posted = true
          return HttpResponse.json<AdjustmentPostResult>(response)
        }),
        http.get(`*/api/v1/assets/${originalAsset.assetId}`, () =>
          HttpResponse.json(posted ? disposedAsset : originalAsset),
        ),
        http.get(`*/api/v1/assets/${originalAsset.assetId}/custody`, () =>
          HttpResponse.json(posted ? closedCustodies : activeCustody ? [activeCustody] : []),
        ),
        http.get(`*/api/v1/assets/${originalAsset.assetId}/movements`, () =>
          HttpResponse.json(
            createPage(posted ? [...existingEvents, disposedEvent] : existingEvents),
          ),
        ),
        http.get('*/api/v1/custodies', () =>
          HttpResponse.json(createPage(!posted && activeCustody ? [activeCustody] : [])),
        ),
        http.get(`*/api/v1/inventory/balances/${balance.balanceId}`, () =>
          HttpResponse.json({ ...balance, quantity: posted || issued ? 2 : 3 }),
        ),
        http.get('*/api/v1/inventory/movements', () =>
          HttpResponse.json(createPage(posted ? stockRows : [])),
        ),
      )
      const journey = setupJourney(detailPath(disposal))
      const projections = renderHook(
        () => ({
          asset: useAssetQuery(originalAsset.assetId),
          custody: useAssetCustodyTimelineQuery(originalAsset.assetId),
          pending: useCustodiesQuery({ status: 'Active' }),
          history: useAssetMovementsQuery(originalAsset.assetId, { pageIndex: 0, pageSize: 20 }),
          balance: useInventoryBalanceQuery(balance.balanceId),
          stock: useStockMovementsQuery({ documentId: disposal.documentId }),
        }),
        { wrapper: journey.wrapper },
      )
      await waitFor(() => expect(projections.result.current.asset.data?.derivedStatus).toBe(status))
      await waitFor(() =>
        expect(projections.result.current.balance.data?.quantity).toBe(issued ? 2 : 3),
      )
      await waitFor(() =>
        expect(projections.result.current.pending.data?.items).toHaveLength(issued ? 1 : 0),
      )
      await journey.user.click(await screen.findByRole('button', { name: 'ترحيل السند' }))
      await waitFor(() => expect(projections.result.current.asset.data).toEqual(disposedAsset))
      await waitFor(() => expect(projections.result.current.custody.data).toEqual(closedCustodies))
      await waitFor(() => expect(projections.result.current.pending.data?.items).toEqual([]))
      await waitFor(() =>
        expect(projections.result.current.history.data?.items).toEqual([
          ...existingEvents,
          disposedEvent,
        ]),
      )
      await waitFor(() => expect(projections.result.current.balance.data?.quantity).toBe(2))
      await waitFor(() => expect(projections.result.current.stock.data?.items).toEqual(stockRows))
      expect(posts).toEqual([{ rowVersion: 1 }])
      expect(await screen.findByText('سند إعدام مرحّل لا يقبل العكس')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /عكس|ترحيل السند/ })).not.toBeInTheDocument()
      expect(stockRows).toHaveLength(issued ? 0 : 1)
      if (!issued)
        expect(stockRows[0]).toMatchObject({
          documentId: disposal.documentId,
          documentLineId: scenario.documents.disposal.lines[0]!.lineId,
          material: { id: originalAsset.material.id },
          quantityDelta: -1,
          movementType: 'AdjustmentOut',
        })
      if (issued) {
        expect(response.closedCustodyId).toBe(activeCustody!.custodyId)
        expect(closedCustodies[0]!.issueDocumentId).toBe(scenario.documents.issue.documentId)
      }
      expect(disposedEvent.documentId).toBe(disposal.documentId)
      expect(disposedEvent.documentLineId).toBe(scenario.documents.disposal.lines[0]!.lineId)
      await act(async () => {
        await journey.router.navigate(
          ROUTE_PATHS.assetDetail.replace(':assetId', originalAsset.assetId),
        )
      })
      expect(await screen.findByText('مستبعد')).toBeInTheDocument()
      expect(await screen.findByText(disposal.documentReference)).toBeInTheDocument()
      expect(screen.getByText(originalAsset.receiptLineId!)).toBeInTheDocument()
      expect(screen.getAllByText(originalAsset.assetNumber).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /تعديل|حذف|عكس/ })).not.toBeInTheDocument()
    },
  )
})
