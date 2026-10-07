import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import { toRouteObject } from '@/config/route-registry'
import type { InventoryBalance, StockMovement } from '@/modules/inventory/types/inventory.api-types'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import {
  INVENTORY_BALANCE_ID,
  INVENTORY_MOVEMENT_ID,
  wireInventoryBalance,
  wireStockMovement,
} from '@/test/msw/inventory-wire-fixtures'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

const WAREHOUSE_DISPLAY_NAME = 'المستودع المركزي'
const MATERIAL_DISPLAY_NAME = 'حاسوب مكتبي'

/**
 * Every row is built from the REAL wire contract (`wireInventoryBalance` /
 * `wireStockMovement`), not the frozen generated factories: the list and detail
 * services are typed against `inventory.api-types`, which carries the flat
 * warehouse/material columns and — decisively for this journey — a `postedBy`
 * that is a UUID STRING rather than a nested `NamedReference`.
 */
const BALANCES: readonly InventoryBalance[] = [
  wireInventoryBalance({
    balanceId: INVENTORY_BALANCE_ID,
    lowStock: { state: 'Low', thresholdQuantity: 0 },
    quantity: 0,
  }),
  wireInventoryBalance({
    balanceId: '00000000-0000-4000-8000-000000000141',
    lowStock: { state: 'Sufficient', thresholdQuantity: 3 },
    material: {
      id: wireInventoryBalance().materialId,
      displayName: 'طابعة مكتبية',
      code: wireInventoryBalance().materialCode,
    },
    materialNameAr: 'طابعة مكتبية',
    quantity: 4,
  }),
  wireInventoryBalance({
    balanceId: '00000000-0000-4000-8000-000000000142',
    lowStock: { state: 'NotConfigured', thresholdQuantity: null },
    material: {
      id: wireInventoryBalance().materialId,
      displayName: 'ورق طباعة',
      code: wireInventoryBalance().materialCode,
    },
    materialNameAr: 'ورق طباعة',
    quantity: 12,
  }),
  wireInventoryBalance({
    balanceId: '00000000-0000-4000-8000-000000000143',
    lowStock: { state: 'Disabled', thresholdQuantity: null },
    material: {
      id: wireInventoryBalance().materialId,
      displayName: 'حبر طابعة',
      code: wireInventoryBalance().materialCode,
    },
    materialNameAr: 'حبر طابعة',
    quantity: 8,
  }),
]

const MOVEMENT: StockMovement = wireStockMovement({
  documentReference: 'ADJ-2026-0007',
  movementId: INVENTORY_MOVEMENT_ID,
  movementType: 'AdjustmentOut',
  quantityDelta: -2.125,
})

beforeAll(async () => {
  // Warm the exact lazy-route chunks used below. Under the full parallel suite,
  // module transformation can otherwise outlive Testing Library's default
  // query timeout while the router is correctly showing its Suspense fallback.
  await Promise.all([
    import('@/modules/inventory/pages/inventory-balances-page'),
    import('@/modules/inventory/pages/inventory-balance-detail-page'),
    import('@/modules/inventory/pages/stock-movements-page'),
    import('@/modules/inventory/pages/stock-movement-detail-page'),
  ])
})

function createInventoryRouter(initialEntry: string) {
  return createMemoryRouter(
    [
      toRouteObject('inventoryBalances'),
      toRouteObject('inventoryBalanceDetail'),
      toRouteObject('inventoryMovements'),
      toRouteObject('inventoryMovementDetail'),
    ],
    { initialEntries: [initialEntry] },
  )
}

function renderJourney(initialEntry = ROUTE_PATHS.inventoryBalances) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createInventoryRouter(initialEntry)

  render(
    <QueryClientProvider client={client}>
      <RouteSuspense>
        <RouterProvider router={router} />
      </RouteSuspense>
    </QueryClientProvider>,
  )

  return router
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('inventory explainability journey', () => {
  it('keeps server-owned balance states and immutable movement provenance explainable across routed details', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        okPageJson(BALANCES, { page: 1, pageSize: 10, totalCount: BALANCES.length, totalPages: 1 }),
      ),
      http.get(`${API_BASE_URL}/inventory/balances/:balanceId`, ({ params }) => {
        const balance = BALANCES.find((candidate) => candidate.balanceId === params['balanceId'])
        return balance
          ? okJson(balance)
          : errJson(404, {
              code: 'INVENTORY_BALANCES_NOT_FOUND',
              message: 'Balance not found.',
              detail: 'لا تعرض تفاصيل سبب عدم العثور على السجل.',
            })
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, () =>
        okPageJson([MOVEMENT], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
      ),
      http.get(`${API_BASE_URL}/inventory/movements/:movementId`, ({ params }) =>
        params['movementId'] === MOVEMENT.movementId
          ? okJson(MOVEMENT)
          : errJson(404, {
              code: 'INVENTORY_MOVEMENTS_NOT_FOUND',
              message: 'Movement not found.',
              detail: 'لا تعرض تفاصيل سبب عدم العثور على السجل.',
            }),
      ),
    )

    const router = renderJourney()

    expect(await screen.findByRole('heading', { name: 'أرصدة المخزون' })).toBeInTheDocument()
    expect(await screen.findByText('منخفض')).toBeInTheDocument()
    expect(screen.getByText('الرصيد كافٍ')).toBeInTheDocument()
    expect(screen.getByText('حدّ التنبيه غير محدد')).toBeInTheDocument()
    expect(screen.getByText('تنبيه الانخفاض معطّل')).toBeInTheDocument()
    expect(screen.getByLabelText('حدّ التنبيه: ٠')).toBeInTheDocument()
    expect(screen.getByLabelText('حدّ التنبيه: ٣')).toBeInTheDocument()
    expect(screen.queryByLabelText('حدّ التنبيه: null')).not.toBeInTheDocument()

    const balanceLink = screen.getByRole('link', {
      name: new RegExp(`عرض تفاصيل رصيد ${MATERIAL_DISPLAY_NAME}`),
    })
    expect(balanceLink).toHaveAttribute('href', `/inventory/balances/${INVENTORY_BALANCE_ID}`)
    await user.click(balanceLink)

    expect(await screen.findByRole('heading', { name: 'تفاصيل الرصيد' })).toBeInTheDocument()
    expect(await screen.findByText(WAREHOUSE_DISPLAY_NAME)).toBeInTheDocument()
    expect(screen.getAllByText('٠')).toHaveLength(2)
    expect(screen.getByText('منخفض')).toBeInTheDocument()
    expect(screen.getByText('حدّ التنبيه')).toBeInTheDocument()

    await act(async () => {
      await router.navigate('/inventory/balances/00000000-0000-4000-8000-000000000199')
    })
    expect(await screen.findByRole('heading', { name: 'الرصيد غير متاح' })).toBeInTheDocument()
    expect(
      screen.getByText('لا يتوفر هذا الرصيد ضمن نطاق العمل الحالي، أو لم يعد موجوداً.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('لا تعرض تفاصيل سبب عدم العثور على السجل.')).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate(ROUTE_PATHS.inventoryMovements)
    })
    expect(await screen.findByRole('heading', { name: 'حركات المخزون' })).toBeInTheDocument()
    expect(await screen.findByText('تسوية بالنقص')).toBeInTheDocument()

    const movementLink = screen.getByRole('link', { name: /عرض تفاصيل حركة 00000000…/ })
    expect(movementLink).toHaveAttribute('href', `/inventory/movements/${MOVEMENT.movementId}`)
    await user.click(movementLink)

    expect(await screen.findByRole('heading', { name: 'تفاصيل حركة المخزون' })).toBeInTheDocument()
    expect(await screen.findByText(MOVEMENT.documentReference)).toBeInTheDocument()
    expect(screen.getByText('تسوية بالنقص')).toBeInTheDocument()
    expect(screen.getByText('-٢٫١٢٥')).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.documentId)).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.documentLineId)).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.movementId)).toBeInTheDocument()
    // The posting user is a UUID string on the wire, so the detail page renders
    // it as a string child without tripping React's object-child guard.
    expect(screen.getByText(MOVEMENT.postedBy)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/نوع المستند/)).not.toBeInTheDocument()
  })
})
