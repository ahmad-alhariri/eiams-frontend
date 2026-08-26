import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import { toRouteObject } from '@/config/route-registry'
import { RouteSuspense } from '@/shared/layout/route-suspense'
import type { InventoryBalance, StockMovement } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const BALANCE_ID = '00000000-0000-4000-8000-000000000140'
const MOVEMENT_ID = '00000000-0000-4000-8000-000000000170'

const WAREHOUSE = {
  id: '00000000-0000-4000-8000-000000000130',
  displayName: 'المستودع المركزي',
}

const MATERIAL = {
  id: '00000000-0000-4000-8000-000000000124',
  displayName: 'حاسوب مكتبي',
}

const BALANCES: readonly InventoryBalance[] = [
  {
    balanceId: BALANCE_ID,
    lastUpdated: '2026-08-21T10:00:00.000Z',
    lowStock: { state: 'Low', thresholdQuantity: 0 },
    material: MATERIAL,
    quantity: 0,
    rowVersion: 1,
    warehouse: WAREHOUSE,
  },
  {
    balanceId: '00000000-0000-4000-8000-000000000141',
    lastUpdated: '2026-08-21T10:00:00.000Z',
    lowStock: { state: 'Sufficient', thresholdQuantity: 3 },
    material: { ...MATERIAL, displayName: 'طابعة مكتبية' },
    quantity: 4,
    rowVersion: 1,
    warehouse: WAREHOUSE,
  },
  {
    balanceId: '00000000-0000-4000-8000-000000000142',
    lastUpdated: '2026-08-21T10:00:00.000Z',
    lowStock: { state: 'NotConfigured', thresholdQuantity: null },
    material: { ...MATERIAL, displayName: 'ورق طباعة' },
    quantity: 12,
    rowVersion: 1,
    warehouse: WAREHOUSE,
  },
  {
    balanceId: '00000000-0000-4000-8000-000000000143',
    lastUpdated: '2026-08-21T10:00:00.000Z',
    lowStock: { state: 'Disabled', thresholdQuantity: null },
    material: { ...MATERIAL, displayName: 'حبر طابعة' },
    quantity: 8,
    rowVersion: 1,
    warehouse: WAREHOUSE,
  },
]

const MOVEMENT: StockMovement = {
  documentId: '00000000-0000-4000-8000-000000000160',
  documentLineId: '00000000-0000-4000-8000-000000000161',
  documentReference: 'ADJ-2026-0007',
  material: MATERIAL,
  movementId: MOVEMENT_ID,
  movementType: 'AdjustmentOut',
  postedAt: '2026-08-21T10:00:00.000Z',
  postedBy: { id: '00000000-0000-4000-8000-000000000110', displayName: 'مدير المستودع' },
  quantityDelta: -2.125,
  warehouse: WAREHOUSE,
}

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
        HttpResponse.json({
          items: BALANCES,
          meta: { pageIndex: 0, pageSize: 10, totalItems: BALANCES.length, totalPages: 1 },
        }),
      ),
      http.get(`${API_BASE_URL}/inventory/balances/:balanceId`, ({ params }) => {
        const balance = BALANCES.find((candidate) => candidate.balanceId === params['balanceId'])
        return balance
          ? HttpResponse.json(balance)
          : HttpResponse.json(
              {
                code: 'inventory.balance.not_found',
                detailAr: 'لا تعرض تفاصيل سبب عدم العثور على السجل.',
                status: 404,
                titleAr: 'الرصيد غير موجود',
              },
              { status: 404 },
            )
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, () =>
        HttpResponse.json({
          items: [MOVEMENT],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 1, totalPages: 1 },
        }),
      ),
      http.get(`${API_BASE_URL}/inventory/movements/:movementId`, ({ params }) =>
        params['movementId'] === MOVEMENT_ID
          ? HttpResponse.json(MOVEMENT)
          : HttpResponse.json(
              {
                code: 'inventory.movement.not_found',
                detailAr: 'لا تعرض تفاصيل سبب عدم العثور على السجل.',
                status: 404,
                titleAr: 'الحركة غير موجودة',
              },
              { status: 404 },
            ),
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

    const balanceLink = screen.getByRole('link', { name: /عرض تفاصيل رصيد حاسوب مكتبي/ })
    expect(balanceLink).toHaveAttribute('href', `/inventory/balances/${BALANCE_ID}`)
    await user.click(balanceLink)

    expect(await screen.findByRole('heading', { name: 'تفاصيل الرصيد' })).toBeInTheDocument()
    expect(await screen.findByText(WAREHOUSE.displayName)).toBeInTheDocument()
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
    expect(movementLink).toHaveAttribute('href', `/inventory/movements/${MOVEMENT_ID}`)
    await user.click(movementLink)

    expect(await screen.findByRole('heading', { name: 'تفاصيل حركة المخزون' })).toBeInTheDocument()
    expect(await screen.findByText(MOVEMENT.documentReference as string)).toBeInTheDocument()
    expect(screen.getByText('تسوية بالنقص')).toBeInTheDocument()
    expect(screen.getByText('-٢٫١٢٥')).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.documentId)).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.documentLineId)).toBeInTheDocument()
    expect(screen.getByText(MOVEMENT.movementId)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/نوع المستند/)).not.toBeInTheDocument()
  })
})
