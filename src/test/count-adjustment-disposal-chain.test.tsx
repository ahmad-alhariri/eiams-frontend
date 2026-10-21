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
  AdjustmentDetail,
  AdjustmentListItem,
} from '@/modules/adjustment/types/adjustment.types'
import type { Asset, AssetCustody } from '@/shared/types/generated/eiams-v1'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import { toWireDetails, toWirePolicy } from '@/test/msw/warehouse-document-handlers'
import {
  createDocumentPolicy,
  createPolicyBlocker,
  createActionAvailability,
  createSession,
} from '@/test/msw/factories'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import { apiJson, okJson, okPageJson } from '@/test/msw/envelope'
import { countNameHandlers } from '@/test/msw/count-wire-fixtures'
import { server } from '@/test/msw/server'

/**
 * The real post body is the shared document engine's `{ documentId, warnings }`
 * projection (the backend serves `PostDocumentCommand ->
 * Application.WarehouseDocuments.Post.PostDocumentResponse` from
 * `POST /adjustments/{id}/post`). The page reads nothing out of it; projections
 * come from refetches. This type exists so the fixture cannot regress into the
 * snapshot's phantom `AdjustmentPostResult`.
 */
type PostWireResult = {
  readonly documentId: string
  readonly warnings: readonly unknown[]
}

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

function detailPath(value: AdjustmentDetail) {
  return ROUTE_PATHS.adjustmentDetail.replace(':adjustmentId', value.id)
}

const SIGNED_MISSING_AR = 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.'

/**
 * List projection for the module's `/adjustments` read: the page renders this
 * shape and nothing else.
 */
function listRowOf(value: AdjustmentDetail): AdjustmentListItem {
  return {
    id: value.id,
    warehouseId: value.warehouseId,
    warehouseCode: value.warehouseCode,
    warehouseName: value.warehouseName,
    countId: value.countId,
    purpose: value.purpose,
    status: value.status,
    reason: value.reason,
    systemReferenceNumber: value.systemReferenceNumber,
    documentStatus: value.documentStatus,
    lineCount: value.lines.length,
    totalDifference: value.lines.reduce((total, line) => total + line.difference, 0),
    createdAtUtc: value.createdAtUtc,
    postedAtUtc: value.postedAtUtc,
    rowVersion: value.rowVersion,
  }
}

/** Draft read-model row for the module's own adjustment response. */
function draftOf(value: AdjustmentDetail): AdjustmentDetail {
  return {
    ...value,
    status: 'Draft',
    documentStatus: 'Draft',
    postedAtUtc: null,
    rowVersion: 1,
  }
}

/**
 * Draft engine-side projection of the adjustment document, for the wire reads
 * the detail page mounts besides the module's own response
 * (`GET /warehouse-documents/{id}` + `/policy`). The signed flag toggles the
 * SignedOriginal attachment and the policy's gate, exactly as the server's own
 * policy evaluation would report them.
 */
function draftDocumentOf(value: AdjustmentDetail, signed = true): WarehouseDocument {
  const document =
    value.purpose === 'Disposal' ? scenario.documents.disposal : scenario.documents.adjustment
  return {
    ...document,
    documentStatus: 'Draft',
    postedAt: null,
    rowVersion: 1,
    attachments: signed ? [...document.attachments] : [],
    policy: createDocumentPolicy({
      documentId: document.documentId,
      documentStatus: 'Draft',
      rowVersion: 1,
      policyKind: 'Adjustment',
      signedOriginalSatisfied: signed,
      blockers: signed
        ? []
        : [
            createPolicyBlocker({
              code: 'document.signed_original_missing',
              messageAr: SIGNED_MISSING_AR,
            }),
          ],
      actions: [
        createActionAvailability('Post', {
          allowed: signed,
          presentation: signed ? 'Enabled' : 'Disabled',
          reasonAr: signed ? null : SIGNED_MISSING_AR,
          reasonCode: signed ? null : 'document.signed_original_missing',
        }),
      ],
    }),
  }
}

/** Registers the two wire reads the rewired detail page fetches. */
function wireDocumentHandlers(document: WarehouseDocument) {
  server.use(
    http.get(`*/api/v1/warehouse-documents/${document.documentId}`, () =>
      okJson(toWireDetails(document)),
    ),
    http.get(`*/api/v1/warehouse-documents/${document.documentId}/policy`, () =>
      okJson(toWirePolicy(document)),
    ),
  )
}

function postResult(documentId: string): PostWireResult {
  return { documentId, warnings: [] }
}

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

function countHandlers() {
  server.use(
    ...countNameHandlers({
      warehouses: { [scenario.warehouses.source.id]: scenario.warehouses.source.name },
      materials: { [scenario.catalog.consumableMaterial.id]: scenario.catalog.consumableMaterial.nameAr },
    }),
    http.get(`*/api/v1/inventory-counts/${count.id}`, () => apiJson(count)),
    http.get(`*/api/v1/inventory-counts/${count.id}/lines`, () =>
      okPageJson(scenario.adjustments.countLines),
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
        row.materialId === scenario.catalog.consumableMaterial.id &&
        row.warehouseId === count.warehouseId,
    )!
    const movement = scenario.ledgers.stockMovements.find(
      (row) => row.documentId === adjustment.id,
    )!
    const draft = draftOf(adjustment)
    // Predetermined server responses, not a client-side ledger/transaction simulator.
    let posted = false
    const creates: unknown[] = []
    const adjustmentCreates: string[] = []
    const posts: { body: unknown; key: string | null }[] = []
    server.use(
      http.post(`*/api/v1/inventory-counts/${count.id}/adjustment`, async ({ request }) => {
        adjustmentCreates.push(await request.text())
        return apiJson({ id: adjustment.id }, { status: 201 })
      }),
      http.post('*/api/v1/adjustments', async ({ request }) => {
        creates.push(await request.json())
        return apiJson(draft, { status: 201 })
      }),
      http.get('*/api/v1/adjustments', () => okPageJson([listRowOf(posted ? adjustment : draft)])),
      http.get(`*/api/v1/adjustments/${adjustment.id}`, () => apiJson(posted ? adjustment : draft)),
      http.post(`*/api/v1/adjustments/${adjustment.id}/post`, async ({ request }) => {
        posts.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        posted = true
        return apiJson(postResult(adjustment.id))
      }),
      http.get(`*/api/v1/warehouse-documents/${adjustment.id}`, () =>
        okJson(toWireDetails(posted ? scenario.documents.adjustment : draftDocumentOf(draft))),
      ),
      http.get(`*/api/v1/warehouse-documents/${adjustment.id}/policy`, () =>
        okJson(toWirePolicy(posted ? scenario.documents.adjustment : draftDocumentOf(draft))),
      ),
      http.get(`*/api/v1/inventory/balances/${balance.id}`, () =>
        apiJson(posted ? balance : { ...balance, quantity: 7 }),
      ),
      http.get('*/api/v1/inventory/movements', () => okPageJson(posted ? [movement] : [])),
    )
    const journey = setupJourney(ROUTE_PATHS.countDetail.replace(':countId', count.id))
    const projections = renderHook(
      () => ({
        balance: useInventoryBalanceQuery(balance.id),
        movements: useStockMovementsQuery({ documentId: adjustment.id }),
      }),
      { wrapper: journey.wrapper },
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: new RegExp('\u062C\u0631\u062F \u062F\u0648\u0631\u064A') }),
    ).toBeInTheDocument()
    await waitFor(() => expect(projections.result.current.balance.data?.quantity).toBe(7))
    expect(projections.result.current.movements.data?.items).toEqual([])
    expect(creates).toHaveLength(0)
    await journey.user.click(screen.getByRole('button', { name: /إنشاء مسودة/ }))
    await waitFor(() => expect(adjustmentCreates).toHaveLength(1))
    // The frozen contract: the client creates NO adjustment body — the server
    // derives the variance lines from the count and returns the draft id.
    expect(adjustmentCreates[0]).toBe('')
    // The client no longer builds an adjustment document from the count lines.
    expect(creates).toHaveLength(0)
    expect((await screen.findAllByText(scenario.warehouses.source.name)).length).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText((_, element) =>
        element?.textContent?.includes(adjustment.systemReferenceNumber) ?? false,
      )).length,
    ).toBeGreaterThan(0)
    expect(
      await screen.findByText(scenario.documents.adjustment.attachments[0]!.originalFilename),
    ).toBeInTheDocument()
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
      documentId: adjustment.id,
      lineId: scenario.documents.adjustment.lines[0]!.lineId,
      materialId: adjustment.lines[0]!.materialId,
      quantityDelta: 2,
      movementType: 'AdjustmentIn',
      postedAtUtc: adjustment.postedAtUtc,
    })
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('blocks posting without a signed original, and hides it from keepers despite an enabled policy', async () => {
    const post = vi.fn()
    wireDocumentHandlers(draftDocumentOf(adjustment, false))
    server.use(
      http.get(`*/api/v1/adjustments/${adjustment.id}`, () => apiJson(draftOf(adjustment))),
      http.post(`*/api/v1/adjustments/${adjustment.id}/post`, post),
    )
    const journey = setupJourney(detailPath(adjustment))
    const button = await screen.findByRole('button', { name: 'ترحيل السند' })
    expect(
      screen.getAllByText('يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.').length,
    ).toBeGreaterThan(0)
    await journey.user.click(button)
    expect(post).not.toHaveBeenCalled()
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
        `*/api/v1/inventory-counts/${count.id}/lines`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    const journey = setupJourney(
      `${ROUTE_PATHS.adjustmentNew}?countId=${count.id}&purpose=CountVariance&warehouseId=${count.warehouseId}`,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل بيانات الجرد')
    countHandlers()
    await journey.user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
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
      const draft = draftOf({
        ...disposal,
        lines: [
          {
            ...disposal.lines[0]!,
            assets: [
              {
                id: originalAsset.assetId,
                assetNumber: originalAsset.assetNumber,
                serialNumber: originalAsset.serialNumber ?? null,
              },
            ],
          },
        ],
      })
      const stockRows = issued
        ? []
        : scenario.ledgers.stockMovements.filter((row) => row.documentId === disposal.id)
      const balance = scenario.ledgers.balances.find(
        (row) => row.materialId === originalAsset.material.id,
      )!
      const activeCustody = scenario.ledgers.custodies.find(
        (row) => row.assetId === originalAsset.assetId && row.status === 'Active',
      )
      const closedCustodies: AssetCustody[] = activeCustody
        ? [{ ...activeCustody, status: 'Closed', toTs: disposal.postedAtUtc! }]
        : []
      // The custody-timeline endpoint serves the live wire row (flat
      // `holderType`/`holderId`, `fromUtc`/`toUtc`); the scenario keeps the
      // legacy generated shape, so the projection happens here, at the consumer.
      const toCustodyTimelineRow = (custody: AssetCustody) => ({
        custodyId: custody.custodyId,
        assetId: custody.assetId,
        holderType: custody.holder.type,
        holderId: custody.holder.id,
        custodyKind: custody.custodyKind,
        issueDocumentId: custody.issueDocumentId,
        returnDocumentId: custody.returnDocumentId ?? null,
        status: custody.status,
        fromUtc: custody.fromTs,
        toUtc: custody.toTs ?? null,
        rowVersion: custody.rowVersion,
      })
      const existingEvents = scenario.ledgers.assetMovements.filter(
        (row) => row.assetId === originalAsset.assetId && row.eventType !== 'Disposed',
      )
      const disposedEvent = {
        ...scenario.ledgers.assetMovements.find((row) => row.eventType === 'Disposed')!,
        assetId: originalAsset.assetId,
        ...(activeCustody ? { custodyId: activeCustody.custodyId } : {}),
      }
      let posted = false
      const posts: unknown[] = []
      const postedAdjustment: AdjustmentDetail = {
        ...draft,
        status: 'Posted',
        documentStatus: 'Posted',
        postedAtUtc: disposal.postedAtUtc,
        rowVersion: draft.rowVersion + 1,
      }
      server.use(
        http.get(`*/api/v1/adjustments/${disposal.id}`, () =>
          apiJson(posted ? postedAdjustment : draft),
        ),
        http.post(`*/api/v1/adjustments/${disposal.id}/post`, async ({ request }) => {
          posts.push(await request.json())
          posted = true
          // PostDocumentResponse: the page reads nothing out of it; the
          // asset/custody/balance/ledger projections come from refetches.
          return apiJson(postResult(disposal.id))
        }),
        http.get(`*/api/v1/warehouse-documents/${disposal.id}`, () =>
          okJson(
            toWireDetails(posted ? scenario.documents.disposal : draftDocumentOf(draft, true)),
          ),
        ),
        http.get(`*/api/v1/warehouse-documents/${disposal.id}/policy`, () =>
          okJson(toWirePolicy(posted ? scenario.documents.disposal : draftDocumentOf(draft, true))),
        ),
        http.get(`*/api/v1/assets/${originalAsset.assetId}`, () =>
          apiJson(posted ? disposedAsset : originalAsset),
        ),
        http.get(`*/api/v1/assets/${originalAsset.assetId}/custody-timeline`, () =>
          okJson(
            (posted ? closedCustodies : activeCustody ? [activeCustody] : []).map(
              toCustodyTimelineRow,
            ),
          ),
        ),
        http.get(`*/api/v1/assets/${originalAsset.assetId}/movements`, () =>
          okPageJson(posted ? [...existingEvents, disposedEvent] : existingEvents),
        ),
        http.get('*/api/v1/custodies', () =>
          okPageJson(!posted && activeCustody ? [activeCustody] : []),
        ),
        http.get(`*/api/v1/inventory/balances/${balance.id}`, () =>
          apiJson({ ...balance, quantity: posted || issued ? 2 : 3 }),
        ),
        http.get('*/api/v1/inventory/movements', () => okPageJson(posted ? stockRows : [])),
      )
      const journey = setupJourney(detailPath(disposal))
      const projections = renderHook(
        () => ({
          asset: useAssetQuery(originalAsset.assetId),
          custody: useAssetCustodyTimelineQuery(originalAsset.assetId),
          pending: useCustodiesQuery({ status: 'Active' }),
          history: useAssetMovementsQuery(originalAsset.assetId, { pageIndex: 0, pageSize: 20 }),
          balance: useInventoryBalanceQuery(balance.id),
          stock: useStockMovementsQuery({ documentId: disposal.id }),
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
      await waitFor(() =>
        expect(projections.result.current.custody.data).toEqual(
          closedCustodies.map(toCustodyTimelineRow),
        ),
      )
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
          documentId: disposal.id,
          lineId: scenario.documents.disposal.lines[0]!.lineId,
          materialId: originalAsset.material.id,
          quantityDelta: -1,
          movementType: 'AdjustmentOut',
        })
      if (issued) {
        expect(closedCustodies[0]!.issueDocumentId).toBe(scenario.documents.issue.documentId)
      }
      expect(disposedEvent.documentId).toBe(disposal.id)
      expect(disposedEvent.documentLineId).toBe(scenario.documents.disposal.lines[0]!.lineId)
      await act(async () => {
        await journey.router.navigate(
          ROUTE_PATHS.assetDetail.replace(':assetId', originalAsset.assetId),
        )
      })
      expect(await screen.findByText('مستبعد')).toBeInTheDocument()
      expect(await screen.findByText(disposal.systemReferenceNumber)).toBeInTheDocument()
      expect(screen.getByText(originalAsset.receiptLineId!)).toBeInTheDocument()
      expect(screen.getAllByText(originalAsset.assetNumber).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /تعديل|حذف|عكس/ })).not.toBeInTheDocument()
    },
  )
})
