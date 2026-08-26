import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AdjustmentsListPage from './adjustments-list-page'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type {
  AdjustmentPurpose,
  AdjustmentStatus,
  InventoryAdjustment,
  InventoryAdjustmentPage,
  SessionResponse,
} from '@/shared/types/generated/eiams-v1'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/warehouse/hooks/use-scoped-warehouse-selector', () => ({
  useScopedWarehouseSelector: () => ({
    scopeReady: true,
    loadOptions: vi.fn().mockResolvedValue([]),
  }),
}))

const API_BASE_URL = '/api/v1'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'adjustment.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'
const WAREHOUSE_ID = '823e4567-e89b-42d3-a456-426614174008'

function adjustmentFixture(overrides: {
  adjustmentId?: string
  documentReference?: string
  purpose?: AdjustmentPurpose
  status?: AdjustmentStatus
}): InventoryAdjustment {
  const purpose = overrides.purpose ?? 'DirectCorrection'
  return {
    adjustmentId: overrides.adjustmentId ?? ADJUSTMENT_ID,
    documentReference:
      overrides.documentReference ??
      (purpose === 'CountVariance'
        ? 'EIAMS-ADJ-2026-0002'
        : purpose === 'Disposal'
          ? 'EIAMS-ADJ-2026-0003'
          : 'EIAMS-ADJ-2026-0001'),
    createdAt: '2026-08-25T08:00:00.000Z',
    createdBy: { id: fixtureUserId(), displayName: 'مدير المستودع' },
    documentId: '523e4567-e89b-42d3-a456-426614174005',
    countReference: purpose === 'CountVariance' ? ('EIAMS-CNT-2026-0007' as string | null) : null,
    lines: [
      {
        adjustmentLineId: '623e4567-e89b-42d3-a456-426614174006',
        material: { id: '723e4567-e89b-42d3-a456-426614174007', displayName: 'حاسوب مكتبي' },
        quantityDelta: -2,
        reason: 'تسوية عجز إدخال',
      },
    ],
    policy: {
      actions: [],
      advisories: [],
      blockers: [],
      documentId: '523e4567-e89b-42d3-a456-426614174005',
      documentStatus: 'Draft',
      evaluatedAt: '2026-08-25T08:00:00.000Z',
      policyKind: purpose === 'Disposal' ? 'Disposal' : 'Adjustment',
      rowVersion: 1,
      signedOriginalSatisfied: false,
    },
    postedAt: null,
    purpose,
    reason: 'تسوية عجز إدخال بعد جلسة الجرد الشهري للمستودع المركزي',
    rowVersion: 2,
    status: overrides.status ?? 'Draft',
    warehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
  }
}

function fixtureUserId(): string {
  return '923e4567-e89b-42d3-a456-426614174009'
}

let capturedListUrl: URL | null = null

function useAdjustmentsHandler(items: readonly InventoryAdjustment[]) {
  capturedListUrl = null
  server.use(
    http.get(`${API_BASE_URL}/adjustments`, ({ request }) => {
      capturedListUrl = new URL(request.url)
      return HttpResponse.json<InventoryAdjustmentPage>({
        items: [...items],
        meta: { pageIndex: 0, pageSize: 20, totalItems: items.length, totalPages: 1 },
      })
    }),
  )
}

function renderPage(permissionCodes: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={['/adjustments']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/adjustments" element={<AdjustmentsListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AdjustmentsListPage (e21-t02)', () => {
  it('renders adjustment documents with Arabic labels and a detail link', async () => {
    useAdjustmentsHandler([
      adjustmentFixture({}),
      adjustmentFixture({
        adjustmentId: '443e4567-e89b-42d3-a456-426614174044',
        purpose: 'Disposal',
        status: 'Posted',
      }),
      adjustmentFixture({
        adjustmentId: '453e4567-e89b-42d3-a456-426614174045',
        purpose: 'CountVariance',
        status: 'Posted',
      }),
    ])
    renderPage(['document.view'])

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات التسوية' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('EIAMS-ADJ-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('تسوية مباشرة')).toBeInTheDocument()
    expect(screen.getByText('إعدام أصل')).toBeInTheDocument()
    expect(screen.getByText('تسوية فروقات الجرد')).toBeInTheDocument()

    const detailLink = screen.getByRole('link', { name: /EIAMS-ADJ-2026-0001/ })
    expect(detailLink.getAttribute('href')).toBe(`/adjustments/${ADJUSTMENT_ID}`)
  })

  it('offers the create CTA to a manager with document.create', async () => {
    useAdjustmentsHandler([])
    renderPage(['document.view', 'document.create'])

    await screen.findByRole('heading', { level: 1, name: 'سندات التسوية' })
    const cta = screen.getByRole('link', { name: 'سند تسوية جديد' })
    expect(cta.getAttribute('href')).toBe('/adjustments/new')
  })

  it('hides the create CTA without document.create (keeper view)', async () => {
    useAdjustmentsHandler([])
    renderPage(['document.view'])

    await screen.findByRole('heading', { level: 1, name: 'سندات التسوية' })
    expect(screen.queryByRole('link', { name: 'سند تسوية جديد' })).toBeNull()
  })

  it('refetches with the selected purpose filter as a query param', async () => {
    useAdjustmentsHandler([])
    renderPage(['document.view'])

    await screen.findByRole('heading', { level: 1, name: 'سندات التسوية' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب غرض التسوية' }))
    await user.click(await screen.findByRole('option', { name: 'إعدام أصل' }))

    await waitFor(() => expect(capturedListUrl?.searchParams.get('purpose')).toBe('Disposal'))
  })

  it('shows the empty state message when no adjustments exist', async () => {
    useAdjustmentsHandler([])
    renderPage(['document.view'])

    expect(await screen.findByText('لا توجد سندات تسوية')).toBeInTheDocument()
  })

  it('shows the error state with retry when the list request fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/adjustments`, () =>
        HttpResponse.json({ title: 'Server Error' }, { status: 500 }),
      ),
    )
    renderPage(['document.view'])

    expect(await screen.findByText('تعذّر تحميل سندات التسوية')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })
})
