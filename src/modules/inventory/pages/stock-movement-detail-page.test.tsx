import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StockMovement } from '@/modules/inventory/types/inventory.api-types'
import { errJson, okJson } from '@/test/msw/envelope'
import {
  INVENTORY_MOVEMENT_ID,
  INVENTORY_POSTED_BY_ID,
  wireStockMovement,
} from '@/test/msw/inventory-wire-fixtures'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import StockMovementDetailPage from './stock-movement-detail-page'

const API_BASE_URL = '/api/v1'
const MOVEMENT_ID = INVENTORY_MOVEMENT_ID

/**
 * `postedBy` is a UUID STRING, not a nested reference.
 *
 * `Application/StockMovements/GetList/StockMovementResponse.cs` declares
 * `Guid PostedBy`, and `StockMovementQuerySupport.Build` projects
 * `movement.PostedBy` straight into that slot; the GetByDocument and
 * GetByWarehouse DTOs declare it the same way. So the wire value is a bare GUID
 * string and `inventory.api-types.StockMovement.postedBy: Uuid` is correct. The
 * FROZEN GENERATED snapshot's `postedBy: NamedReference` was the fiction — it is
 * what made React throw "Objects are not valid as a React child" when this page
 * rendered `{movement.postedBy}` (stock-movement-detail-page.tsx:127).
 *
 * `wireStockMovement` is therefore the fixture for this page: it mints the real
 * wire record with `postedBy: INVENTORY_POSTED_BY_ID`.
 */
function createMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return wireStockMovement({ movementId: MOVEMENT_ID, ...overrides })
}

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return (
    <MemoryRouter initialEntries={[`/inventory/movements/${MOVEMENT_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/inventory/movements/:movementId" element={children} />
          <Route path="/inventory/movements" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

function MissingIdWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('StockMovementDetailPage', () => {
  it('renders only immutable contract-backed provenance in Arabic RTL', async () => {
    const movement = createMovement({ quantityDelta: -2.125, movementType: 'AdjustmentOut' })
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements/${movement.movementId}`, () =>
        okJson(movement),
      ),
    )

    render(<StockMovementDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تفاصيل حركة المخزون' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(movement.warehouse.displayName)).toBeInTheDocument()
    expect(screen.getByText(movement.material.displayName)).toBeInTheDocument()
    expect(screen.getByText('تسوية بالنقص')).toBeInTheDocument()
    expect(screen.getByText('-٢٫١٢٥')).toBeInTheDocument()
    expect(screen.getByText(movement.documentReference)).toBeInTheDocument()
    expect(screen.getByText(movement.documentId)).toBeInTheDocument()
    expect(screen.getByText(movement.documentLineId)).toBeInTheDocument()
    expect(screen.getByText(movement.movementId)).toBeInTheDocument()
    // `postedBy` is the UUID string the backend serves, so the read-only
    // "رُحّلت بواسطة" row renders it as a string child — never as an object.
    expect(screen.getByText(INVENTORY_POSTED_BY_ID)).toBeInTheDocument()
    expect(screen.queryByText('00000000…')).not.toBeInTheDocument()
    expect(
      screen.getByText('بيانات للقراءة فقط ضمن نطاق العمل الحالي، كما يعرضها الخادم.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل|إضافة|حفظ|حذف/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows neutral 404 copy without a retry and returns to the movement ledger', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements/${MOVEMENT_ID}`, () =>
        errJson(404, {
          code: 'INVENTORY_MOVEMENTS_NOT_FOUND',
          message: 'Movement not found.',
          detail: 'يجب عدم عرض هذه الرسالة التفصيلية.',
        }),
      ),
    )

    render(<StockMovementDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: 'الحركة غير متاحة' })).toBeInTheDocument()
    expect(
      screen.getByText('لا تتوفر هذه الحركة ضمن نطاق العمل الحالي، أو لم تعد موجودة.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('يجب عدم عرض هذه الرسالة التفصيلية.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'العودة إلى الحركات' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/movements')
  })

  it('retries a non-404 detail failure and preserves the return action', async () => {
    const user = userEvent.setup()
    const movement = createMovement()
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements/${MOVEMENT_ID}`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okJson(movement)
      }),
    )

    render(<StockMovementDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل الحركة' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText(movement.warehouse.displayName)).toBeInTheDocument()
  })

  it('does not request a movement when the route has no identifier', () => {
    let requests = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/movements/:movementId`, () => {
        requests += 1
        return okJson(createMovement())
      }),
    )

    render(<StockMovementDetailPage />, { wrapper: MissingIdWrapper })

    expect(screen.getByRole('heading', { name: 'تعذّر تحديد الحركة' })).toBeInTheDocument()
    expect(requests).toBe(0)
  })
})
