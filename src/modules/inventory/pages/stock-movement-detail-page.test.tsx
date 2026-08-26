import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StockMovement } from '@/shared/types/generated/eiams-v1'
import { createNamedReference, createProblemDetails, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import StockMovementDetailPage from './stock-movement-detail-page'

const API_BASE_URL = '/api/v1'
const MOVEMENT_ID = fixtureUuid(70)

function createMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    documentId: fixtureUuid(60),
    documentLineId: fixtureUuid(61),
    documentReference: 'RCP-2026-0001',
    material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
    movementId: MOVEMENT_ID,
    movementType: 'Receipt',
    postedAt: '2026-08-21T10:00:00.000Z',
    postedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
    quantityDelta: 5,
    warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
    ...overrides,
  }
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
        HttpResponse.json(movement),
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
    expect(screen.getByText(movement.documentReference as string)).toBeInTheDocument()
    expect(screen.getByText(movement.documentId)).toBeInTheDocument()
    expect(screen.getByText(movement.documentLineId)).toBeInTheDocument()
    expect(screen.getByText(movement.movementId)).toBeInTheDocument()
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
        HttpResponse.json(
          createProblemDetails({
            status: 404,
            code: 'inventory.movement.not_found',
            titleAr: 'الحركة غير موجودة',
            detailAr: 'يجب عدم عرض هذه الرسالة التفصيلية.',
          }),
          { status: 404 },
        ),
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
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(movement)
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
        return HttpResponse.json(createMovement())
      }),
    )

    render(<StockMovementDetailPage />, { wrapper: MissingIdWrapper })

    expect(screen.getByRole('heading', { name: 'تعذّر تحديد الحركة' })).toBeInTheDocument()
    expect(requests).toBe(0)
  })
})
