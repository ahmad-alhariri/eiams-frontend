import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { environment } from '@/config/env'
import { ROUTE_PATHS } from '@/config/routes'
import { toRouteObject } from '@/config/route-registry'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  inventoryQueryKeys,
  useInventoryBalanceQuery,
  useStockMovementQuery,
} from '@/modules/inventory/hooks/use-inventory-queries'
import { documentQueryKeys, useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type {
  InventoryBalance,
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
const receiving = scenario.documents.receiving
const opening = scenario.documents.opening

const receivingMovement = findMovement(receiving)
const openingMovement = findMovement(opening)
const receivingBalance = findSourceBalance(receiving)
const openingBalance = findSourceBalance(opening)

beforeAll(async () => {
  // Warm the exact lazy routes in this cross-module journey so parallel suite
  // transforms cannot outlive Testing Library's query timeout.
  await Promise.all([
    import('@/modules/receiving/pages/receiving-document-detail-page'),
    import('@/shared/documents/pages/document-detail-page'),
    import('@/modules/inventory/pages/stock-movements-page'),
    import('@/modules/inventory/pages/stock-movement-detail-page'),
    import('@/modules/inventory/pages/inventory-balances-page'),
    import('@/modules/inventory/pages/inventory-balance-detail-page'),
  ])
})

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('receiving and opening balance propagation', () => {
  it('keeps both posted documents traceable through their positive movements and authoritative balances', async () => {
    const movementListQueries: Record<string, string>[] = []
    const balanceListQueries: Record<string, string>[] = []
    useScenarioHandlers(movementListQueries, balanceListQueries)

    const router = renderJourney(receivingDetailPath())

    const receivingHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(receiving.systemReferenceNumber),
    })
    expect(receivingHeading).toHaveTextContent('تفاصيل سند الاستلام')
    expect(screen.getAllByText('مرحّل').length).toBeGreaterThan(0)
    expect(screen.getByText(scenario.catalog.assetMaterial.nameAr)).toBeInTheDocument()
    expect(screen.getByText('سند-استلام-موقّع.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()

    await navigate(router, openingDetailPath())

    const openingHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(opening.systemReferenceNumber),
    })
    expect(openingHeading).toHaveTextContent('تفاصيل سند الفتح الافتتاحي')
    expect(screen.getByText(scenario.catalog.consumableMaterial.nameAr)).toBeInTheDocument()
    expect(screen.getByText('افتتاحية أولية')).toBeInTheDocument()
    expect(screen.getByText('سند-افتتاح-موقّع.pdf')).toBeInTheDocument()

    await navigate(router, ROUTE_PATHS.inventoryMovements)

    expect(await screen.findByRole('heading', { name: 'حركات المخزون' })).toBeInTheDocument()
    expect(screen.getByText('استلام')).toBeInTheDocument()
    expect(screen.getByText('رصيد افتتاحي')).toBeInTheDocument()
    expect(screen.getByText('+٤')).toBeInTheDocument()
    expect(screen.getByText('+١٠')).toBeInTheDocument()
    expect(screen.getByText(receiving.systemReferenceNumber)).toBeInTheDocument()
    expect(screen.getByText(opening.systemReferenceNumber)).toBeInTheDocument()
    expect(movementListQueries.at(-1)).toMatchObject({
      pageIndex: '0',
      pageSize: '10',
      sortBy: 'PostedAt',
      sortDirection: 'Descending',
    })

    await navigate(router, movementDetailPath(receivingMovement))
    await expectMovementDetail(receivingMovement, 'استلام', '+٤')

    await navigate(router, movementDetailPath(openingMovement))
    await expectMovementDetail(openingMovement, 'رصيد افتتاحي', '+١٠')

    await navigate(router, ROUTE_PATHS.inventoryBalances)

    expect(await screen.findByRole('heading', { name: 'أرصدة المخزون' })).toBeInTheDocument()
    const assetRow = screen.getByText(scenario.catalog.assetMaterial.nameAr).closest('tr')
    const consumableRow = screen.getByText(scenario.catalog.consumableMaterial.nameAr).closest('tr')
    expect(assetRow).not.toBeNull()
    expect(consumableRow).not.toBeNull()
    expect(within(assetRow as HTMLElement).getByText('٢')).toBeInTheDocument()
    expect(within(consumableRow as HTMLElement).getByText('٩')).toBeInTheDocument()
    expect(balanceListQueries.at(-1)).toMatchObject({
      pageIndex: '0',
      pageSize: '10',
      sortBy: 'WarehouseDisplayName',
      sortDirection: 'Ascending',
    })

    await navigate(router, balanceDetailPath(receivingBalance))
    await expectBalanceDetail(receivingBalance, '٢')

    await navigate(router, balanceDetailPath(openingBalance))
    await expectBalanceDetail(openingBalance, '٩')
  })

  it('refetches document, movement, and balance reads under a distinct scope cache key', async () => {
    const enterpriseScope = { kind: 'enterprise' } as const
    const warehouseScope = {
      kind: 'warehouse',
      id: scenario.warehouses.source.warehouseId,
    } as const
    const warehouseDocument = { ...receiving, rowVersion: receiving.rowVersion + 1 }
    const warehouseMovement = {
      ...receivingMovement,
      documentReference: `${receivingMovement.documentReference}-WH`,
    }
    const warehouseBalance = {
      ...receivingBalance,
      quantity: receivingBalance.quantity + 1,
      rowVersion: receivingBalance.rowVersion + 1,
    }
    let responseScope: 'enterprise' | 'warehouse' = 'enterprise'
    const requestCounts = { document: 0, movement: 0, balance: 0 }

    server.use(
      http.get(`${environment.apiBaseUrl}/warehouse-documents/${receiving.documentId}`, () => {
        requestCounts.document += 1
        return HttpResponse.json(responseScope === 'enterprise' ? receiving : warehouseDocument)
      }),
      http.get(
        `${environment.apiBaseUrl}/inventory/movements/${receivingMovement.movementId}`,
        () => {
          requestCounts.movement += 1
          return HttpResponse.json(
            responseScope === 'enterprise' ? receivingMovement : warehouseMovement,
          )
        },
      ),
      http.get(`${environment.apiBaseUrl}/inventory/balances/${receivingBalance.balanceId}`, () => {
        requestCounts.balance += 1
        return HttpResponse.json(
          responseScope === 'enterprise' ? receivingBalance : warehouseBalance,
        )
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      () => ({
        document: useDocumentDetailQuery(receiving.documentId).data,
        movement: useStockMovementQuery(receivingMovement.movementId).data,
        balance: useInventoryBalanceQuery(receivingBalance.balanceId).data,
      }),
      { wrapper: createQueryWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.document).toEqual(receiving)
      expect(result.current.movement).toEqual(receivingMovement)
      expect(result.current.balance).toEqual(receivingBalance)
    })
    expect(requestCounts).toEqual({ document: 1, movement: 1, balance: 1 })

    responseScope = 'warehouse'
    activeScope.key = warehouseScope
    rerender()

    await waitFor(() => {
      expect(result.current.document).toEqual(warehouseDocument)
      expect(result.current.movement).toEqual(warehouseMovement)
      expect(result.current.balance).toEqual(warehouseBalance)
    })
    expect(requestCounts).toEqual({ document: 2, movement: 2, balance: 2 })
    expect(
      client.getQueryData(documentQueryKeys.document(enterpriseScope, receiving.documentId)),
    ).toEqual(receiving)
    expect(
      client.getQueryData(documentQueryKeys.document(warehouseScope, receiving.documentId)),
    ).toEqual(warehouseDocument)
    expect(
      client.getQueryData(
        inventoryQueryKeys.movement(enterpriseScope, receivingMovement.movementId),
      ),
    ).toEqual(receivingMovement)
    expect(
      client.getQueryData(
        inventoryQueryKeys.movement(warehouseScope, receivingMovement.movementId),
      ),
    ).toEqual(warehouseMovement)
    expect(
      client.getQueryData(inventoryQueryKeys.balance(enterpriseScope, receivingBalance.balanceId)),
    ).toEqual(receivingBalance)
    expect(
      client.getQueryData(inventoryQueryKeys.balance(warehouseScope, receivingBalance.balanceId)),
    ).toEqual(warehouseBalance)
  })
})

function readOnlySession(): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'cross.module.viewer',
      displayName: 'مراجع التكامل',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: ['document.view', 'inventory.view'],
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
  client.setQueryData(authSessionQueryKey, readOnlySession())
  const router = createMemoryRouter(
    [
      toRouteObject('documentReceivingDetail'),
      toRouteObject('documentOpeningDetail'),
      toRouteObject('inventoryMovements'),
      toRouteObject('inventoryMovementDetail'),
      toRouteObject('inventoryBalances'),
      toRouteObject('inventoryBalanceDetail'),
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
  movementListQueries: Record<string, string>[],
  balanceListQueries: Record<string, string>[],
) {
  const documents = [receiving, opening]
  const movements = [receivingMovement, openingMovement]
  const balances = [receivingBalance, openingBalance]

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
    http.get(`${environment.apiBaseUrl}/inventory/movements`, ({ request }) => {
      movementListQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(createPage(movements, { pageIndex: 0, pageSize: 10 }))
    }),
    http.get(`${environment.apiBaseUrl}/inventory/movements/:movementId`, ({ params }) => {
      const movement = movements.find((candidate) => candidate.movementId === params['movementId'])
      return movement === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(movement)
    }),
    http.get(`${environment.apiBaseUrl}/inventory/balances`, ({ request }) => {
      balanceListQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(createPage(balances, { pageIndex: 0, pageSize: 10 }))
    }),
    http.get(`${environment.apiBaseUrl}/inventory/balances/:balanceId`, ({ params }) => {
      const balance = balances.find((candidate) => candidate.balanceId === params['balanceId'])
      return balance === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(balance)
    }),
  )
}

function findMovement(document: WarehouseDocument): StockMovement {
  const lineId = document.lines[0]?.lineId
  const movement = scenario.ledgers.stockMovements.find(
    (candidate) =>
      candidate.documentId === document.documentId && candidate.documentLineId === lineId,
  )
  if (movement === undefined) {
    throw new Error(`Missing stock movement for document ${document.documentId}`)
  }
  return movement
}

function findSourceBalance(document: WarehouseDocument): InventoryBalance {
  const materialId = document.lines[0]?.material.materialId
  const balance = scenario.ledgers.balances.find(
    (candidate) =>
      candidate.warehouse.id === scenario.warehouses.source.warehouseId &&
      candidate.material.id === materialId,
  )
  if (balance === undefined) {
    throw new Error(`Missing inventory balance for document ${document.documentId}`)
  }
  return balance
}

function receivingDetailPath() {
  return ROUTE_PATHS.documentReceivingDetail.replace(':documentId', receiving.documentId)
}

function openingDetailPath() {
  return ROUTE_PATHS.documentOpeningDetail.replace(':documentId', opening.documentId)
}

function movementDetailPath(movement: StockMovement) {
  return ROUTE_PATHS.inventoryMovementDetail.replace(':movementId', movement.movementId)
}

function balanceDetailPath(balance: InventoryBalance) {
  return ROUTE_PATHS.inventoryBalanceDetail.replace(':balanceId', balance.balanceId)
}

async function navigate(router: ReturnType<typeof createMemoryRouter>, path: string) {
  await act(async () => {
    await router.navigate(path)
  })
}

async function expectMovementDetail(
  movement: StockMovement,
  movementTypeLabel: string,
  formattedDelta: string,
) {
  expect(await screen.findByRole('heading', { name: 'تفاصيل حركة المخزون' })).toBeInTheDocument()
  expect(screen.getByText(movementTypeLabel)).toBeInTheDocument()
  expect(screen.getByText(formattedDelta)).toBeInTheDocument()
  expect(screen.getByText(movement.documentReference as string)).toBeInTheDocument()
  expect(screen.getByText(movement.documentId)).toBeInTheDocument()
  expect(screen.getByText(movement.documentLineId)).toBeInTheDocument()
  expect(screen.getByText(movement.movementId)).toBeInTheDocument()
}

async function expectBalanceDetail(balance: InventoryBalance, formattedQuantity: string) {
  expect(await screen.findByRole('heading', { name: 'تفاصيل الرصيد' })).toBeInTheDocument()
  expect(screen.getByText(balance.material.displayName)).toBeInTheDocument()
  expect(screen.getByText(formattedQuantity)).toBeInTheDocument()
  expect(screen.getByText(balance.balanceId.slice(0, 8) + '…')).toBeInTheDocument()
}
