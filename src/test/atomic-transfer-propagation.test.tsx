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
const transfer = scenario.documents.transfer
const transferOut = findTransferMovement('TransferOut')
const transferIn = findTransferMovement('TransferIn')
const sourceBalance = findTransferBalance(scenario.warehouses.source.warehouseId)
const destinationBalance = findTransferBalance(scenario.warehouses.destination.warehouseId)

beforeAll(async () => {
  await Promise.all([
    import('@/modules/transfer/pages/transfer-document-detail-page'),
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

describe('atomic transfer propagation', () => {
  it('keeps the posted transfer traceable through its paired movements and both balance projections', async () => {
    const movementListQueries: Record<string, string>[] = []
    const balanceListQueries: Record<string, string>[] = []
    registerScenarioHandlers(movementListQueries, balanceListQueries)

    const router = renderJourney(transferDetailPath())

    const transferHeading = await screen.findByRole('heading', {
      level: 1,
      name: new RegExp(transfer.systemReferenceNumber),
    })
    expect(transferHeading).toHaveTextContent('تفاصيل سند التحويل')
    expect(transferHeading.closest('[dir="rtl"]')).not.toBeNull()
    expect(screen.getAllByText('مرحّل').length).toBeGreaterThan(0)
    expect(screen.getByText(scenario.warehouses.source.nameAr)).toBeInTheDocument()
    expect(screen.getByText(scenario.warehouses.destination.nameAr)).toBeInTheDocument()
    expect(screen.getByText('تغذية فرع حمص بالورق')).toBeInTheDocument()
    expect(screen.getByText('سند-نقل-موقّع.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ترحيل|عكس|رفض/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/قيد النقل|تأكيد الاستلام|استلام الوجهة/)).not.toBeInTheDocument()

    expect(transferOut.documentId).toBe(transfer.documentId)
    expect(transferIn.documentId).toBe(transfer.documentId)
    expect(transfer.lines).toHaveLength(1)
    expect(transferOut.documentLineId).toBe(transfer.lines[0]?.lineId)
    expect(transferOut.documentLineId).toBe(transferIn.documentLineId)
    expect(transferOut.material.id).toBe(transfer.lines[0]?.material.materialId)
    expect(transferOut.material.id).toBe(transferIn.material.id)
    expect(transferOut.postedAt).toBe(transfer.postedAt)
    expect(transferOut.postedAt).toBe(transferIn.postedAt)
    expect(transferIn.quantityDelta).toBe(transfer.lines[0]?.quantity)
    expect(transferOut.quantityDelta).toBe(-transferIn.quantityDelta)
    expect(transferOut.warehouse.id).toBe(scenario.warehouses.source.warehouseId)
    expect(transferIn.warehouse.id).toBe(scenario.warehouses.destination.warehouseId)

    await navigate(router, ROUTE_PATHS.inventoryMovements)

    expect(await screen.findByRole('heading', { name: 'حركات المخزون' })).toBeInTheDocument()
    const outboundRow = screen.getByText('تحويل صادر').closest('tr')
    const inboundRow = screen.getByText('تحويل وارد').closest('tr')
    expect(outboundRow).not.toBeNull()
    expect(inboundRow).not.toBeNull()
    expect(
      within(outboundRow as HTMLElement).getByText(scenario.warehouses.source.nameAr),
    ).toBeInTheDocument()
    expect(within(outboundRow as HTMLElement).getByText('-٣')).toBeInTheDocument()
    expect(
      within(outboundRow as HTMLElement).getByText(transfer.systemReferenceNumber),
    ).toBeInTheDocument()
    expect(
      within(inboundRow as HTMLElement).getByText(scenario.warehouses.destination.nameAr),
    ).toBeInTheDocument()
    expect(within(inboundRow as HTMLElement).getByText('+٣')).toBeInTheDocument()
    expect(
      within(inboundRow as HTMLElement).getByText(transfer.systemReferenceNumber),
    ).toBeInTheDocument()
    expect(movementListQueries.at(-1)).toMatchObject({
      pageIndex: '0',
      pageSize: '10',
      sortBy: 'PostedAt',
      sortDirection: 'Descending',
    })

    await navigate(router, movementDetailPath(transferOut))
    await expectMovementDetail(transferOut, 'تحويل صادر', '-٣')

    await navigate(router, movementDetailPath(transferIn))
    await expectMovementDetail(transferIn, 'تحويل وارد', '+٣')

    await navigate(router, ROUTE_PATHS.inventoryBalances)

    expect(await screen.findByRole('heading', { name: 'أرصدة المخزون' })).toBeInTheDocument()
    const sourceRow = screen.getByText(scenario.warehouses.source.nameAr).closest('tr')
    const destinationRow = screen.getByText(scenario.warehouses.destination.nameAr).closest('tr')
    expect(sourceRow).not.toBeNull()
    expect(destinationRow).not.toBeNull()
    expect(
      within(sourceRow as HTMLElement).getByText(scenario.catalog.consumableMaterial.nameAr),
    ).toBeInTheDocument()
    expect(within(sourceRow as HTMLElement).getByText('٩')).toBeInTheDocument()
    expect(
      within(destinationRow as HTMLElement).getByText(scenario.catalog.consumableMaterial.nameAr),
    ).toBeInTheDocument()
    expect(within(destinationRow as HTMLElement).getByText('٣')).toBeInTheDocument()
    expect(balanceListQueries.at(-1)).toMatchObject({
      pageIndex: '0',
      pageSize: '10',
      sortBy: 'WarehouseDisplayName',
      sortDirection: 'Ascending',
    })

    await navigate(router, balanceDetailPath(sourceBalance))
    await expectBalanceDetail(sourceBalance, '٩')

    await navigate(router, balanceDetailPath(destinationBalance))
    await expectBalanceDetail(destinationBalance, '٣')
  })

  it('isolates the transfer, both movements, and both balances across scope cache keys', async () => {
    const enterpriseScope = { kind: 'enterprise' } as const
    const siteScope = { kind: 'site', id: transfer.site.id } as const
    const siteTransfer = { ...transfer, rowVersion: transfer.rowVersion + 1 }
    const siteTransferOut = {
      ...transferOut,
      documentReference: `${transferOut.documentReference}-SITE`,
    }
    const siteTransferIn = {
      ...transferIn,
      documentReference: `${transferIn.documentReference}-SITE`,
    }
    const siteSourceBalance = {
      ...sourceBalance,
      quantity: sourceBalance.quantity + 1,
      rowVersion: sourceBalance.rowVersion + 1,
    }
    const siteDestinationBalance = {
      ...destinationBalance,
      quantity: destinationBalance.quantity + 1,
      rowVersion: destinationBalance.rowVersion + 1,
    }
    let responseScope: 'enterprise' | 'site' = 'enterprise'
    const requestCounts = {
      destinationBalance: 0,
      document: 0,
      transferIn: 0,
      transferOut: 0,
      sourceBalance: 0,
    }

    server.use(
      http.get(`${environment.apiBaseUrl}/warehouse-documents/${transfer.documentId}`, () => {
        requestCounts.document += 1
        return HttpResponse.json(responseScope === 'enterprise' ? transfer : siteTransfer)
      }),
      http.get(`${environment.apiBaseUrl}/inventory/movements/${transferOut.movementId}`, () => {
        requestCounts.transferOut += 1
        return HttpResponse.json(responseScope === 'enterprise' ? transferOut : siteTransferOut)
      }),
      http.get(`${environment.apiBaseUrl}/inventory/movements/${transferIn.movementId}`, () => {
        requestCounts.transferIn += 1
        return HttpResponse.json(responseScope === 'enterprise' ? transferIn : siteTransferIn)
      }),
      http.get(`${environment.apiBaseUrl}/inventory/balances/${sourceBalance.balanceId}`, () => {
        requestCounts.sourceBalance += 1
        return HttpResponse.json(responseScope === 'enterprise' ? sourceBalance : siteSourceBalance)
      }),
      http.get(
        `${environment.apiBaseUrl}/inventory/balances/${destinationBalance.balanceId}`,
        () => {
          requestCounts.destinationBalance += 1
          return HttpResponse.json(
            responseScope === 'enterprise' ? destinationBalance : siteDestinationBalance,
          )
        },
      ),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      () => ({
        destinationBalance: useInventoryBalanceQuery(destinationBalance.balanceId).data,
        document: useDocumentDetailQuery(transfer.documentId).data,
        sourceBalance: useInventoryBalanceQuery(sourceBalance.balanceId).data,
        transferIn: useStockMovementQuery(transferIn.movementId).data,
        transferOut: useStockMovementQuery(transferOut.movementId).data,
      }),
      { wrapper: createQueryWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.document).toEqual(transfer)
      expect(result.current.transferOut).toEqual(transferOut)
      expect(result.current.transferIn).toEqual(transferIn)
      expect(result.current.sourceBalance).toEqual(sourceBalance)
      expect(result.current.destinationBalance).toEqual(destinationBalance)
    })
    expect(requestCounts).toEqual({
      destinationBalance: 1,
      document: 1,
      sourceBalance: 1,
      transferIn: 1,
      transferOut: 1,
    })

    responseScope = 'site'
    activeScope.key = siteScope
    rerender()

    await waitFor(() => {
      expect(result.current.document).toEqual(siteTransfer)
      expect(result.current.transferOut).toEqual(siteTransferOut)
      expect(result.current.transferIn).toEqual(siteTransferIn)
      expect(result.current.sourceBalance).toEqual(siteSourceBalance)
      expect(result.current.destinationBalance).toEqual(siteDestinationBalance)
    })
    expect(requestCounts).toEqual({
      destinationBalance: 2,
      document: 2,
      sourceBalance: 2,
      transferIn: 2,
      transferOut: 2,
    })

    expect(
      client.getQueryData(documentQueryKeys.document(enterpriseScope, transfer.documentId)),
    ).toEqual(transfer)
    expect(client.getQueryData(documentQueryKeys.document(siteScope, transfer.documentId))).toEqual(
      siteTransfer,
    )
    expect(
      client.getQueryData(inventoryQueryKeys.movement(enterpriseScope, transferOut.movementId)),
    ).toEqual(transferOut)
    expect(
      client.getQueryData(inventoryQueryKeys.movement(siteScope, transferOut.movementId)),
    ).toEqual(siteTransferOut)
    expect(
      client.getQueryData(inventoryQueryKeys.movement(enterpriseScope, transferIn.movementId)),
    ).toEqual(transferIn)
    expect(
      client.getQueryData(inventoryQueryKeys.movement(siteScope, transferIn.movementId)),
    ).toEqual(siteTransferIn)
    expect(
      client.getQueryData(inventoryQueryKeys.balance(enterpriseScope, sourceBalance.balanceId)),
    ).toEqual(sourceBalance)
    expect(
      client.getQueryData(inventoryQueryKeys.balance(siteScope, sourceBalance.balanceId)),
    ).toEqual(siteSourceBalance)
    expect(
      client.getQueryData(
        inventoryQueryKeys.balance(enterpriseScope, destinationBalance.balanceId),
      ),
    ).toEqual(destinationBalance)
    expect(
      client.getQueryData(inventoryQueryKeys.balance(siteScope, destinationBalance.balanceId)),
    ).toEqual(siteDestinationBalance)
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
      toRouteObject('documentTransferDetail'),
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

function registerScenarioHandlers(
  movementListQueries: Record<string, string>[],
  balanceListQueries: Record<string, string>[],
) {
  const movements = [transferOut, transferIn]
  const balances = [sourceBalance, destinationBalance]

  server.use(
    http.get(`${environment.apiBaseUrl}/warehouse-documents/${transfer.documentId}`, () =>
      HttpResponse.json(transfer),
    ),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/${transfer.documentId}/history`, () =>
      HttpResponse.json({
        documentId: transfer.documentId,
        currentStatus: transfer.documentStatus,
        currentRowVersion: transfer.rowVersion,
        events: scenario.ledgers.lifecycleEvents[transfer.documentId],
      }),
    ),
    http.get(`${environment.apiBaseUrl}/warehouse-documents/${transfer.documentId}/policy`, () =>
      HttpResponse.json(transfer.policy),
    ),
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

function findTransferMovement(movementType: StockMovement['movementType']): StockMovement {
  const movement = scenario.ledgers.stockMovements.find(
    (candidate) =>
      candidate.documentId === transfer.documentId && candidate.movementType === movementType,
  )
  if (movement === undefined) {
    throw new Error(`Missing ${movementType} movement for transfer ${transfer.documentId}`)
  }
  return movement
}

function findTransferBalance(warehouseId: string): InventoryBalance {
  const materialId = transfer.lines[0]?.material.materialId
  const balance = scenario.ledgers.balances.find(
    (candidate) => candidate.warehouse.id === warehouseId && candidate.material.id === materialId,
  )
  if (balance === undefined) {
    throw new Error(`Missing transfer balance for warehouse ${warehouseId}`)
  }
  return balance
}

function transferDetailPath() {
  return ROUTE_PATHS.documentTransferDetail.replace(':documentId', transfer.documentId)
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
  expect(screen.getByText(movement.warehouse.displayName)).toBeInTheDocument()
  expect(screen.getByText(movementTypeLabel)).toBeInTheDocument()
  expect(screen.getByText(formattedDelta)).toBeInTheDocument()
  expect(screen.getByText(movement.documentReference as string)).toBeInTheDocument()
  expect(screen.getByText(movement.documentId)).toBeInTheDocument()
  expect(screen.getByText(movement.documentLineId)).toBeInTheDocument()
  expect(screen.getByText(movement.movementId)).toBeInTheDocument()
}

async function expectBalanceDetail(balance: InventoryBalance, formattedQuantity: string) {
  expect(await screen.findByRole('heading', { name: 'تفاصيل الرصيد' })).toBeInTheDocument()
  expect(screen.getByText(balance.warehouse.displayName)).toBeInTheDocument()
  expect(screen.getByText(balance.material.displayName)).toBeInTheDocument()
  expect(screen.getByText(formattedQuantity)).toBeInTheDocument()
  expect(screen.getByText(balance.balanceId.slice(0, 8) + '…')).toBeInTheDocument()
}
