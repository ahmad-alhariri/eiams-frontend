import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AdjustmentDetailPage from './adjustment-detail-page'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { InventoryAdjustment, SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'

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
      { scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة العامة للرقابة والتفتيش' },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function draftFixture(): InventoryAdjustment {
  return {
    adjustmentId: ADJUSTMENT_ID,
    attachments: [],
    countReference: null,
    createdAt: '2026-08-26T08:00:00.000Z',
    createdBy: { id: '923e4567-e89b-42d3-a456-426614174009', displayName: 'مدير المستودع' },
    documentId: '523e4567-e89b-42d3-a456-426614174005',
    documentReference: 'EIAMS-ADJ-DRAFT-0001',
    lines: [
      {
        adjustmentLineId: '623e4567-e89b-42d3-a456-426614174006',
        material: { id: '723e4567-e89b-42d3-a456-426614174007', displayName: 'حاسوب مكتبي' },
        quantityDelta: -3,
        reason: 'عجز مؤكد بمراجعة اللجنة',
      },
    ],
    policy: {
      actions: [
        {
          action: 'Post',
          allowed: false,
          confirmationRequired: true,
          presentation: 'Disabled',
          reasonAr: 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.',
          reasonCode: 'SignedOriginalRequired',
          reasonRequired: false,
        },
      ],
      advisories: [],
      blockers: [
        {
          code: 'SignedOriginalRequired',
          field: null,
          messageAr: 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.',
        },
      ],
      documentId: '523e4567-e89b-42d3-a456-426614174005',
      documentStatus: 'Draft',
      evaluatedAt: '2026-08-26T08:05:00.000Z',
      policyKind: 'Adjustment',
      rowVersion: 2,
      signedOriginalSatisfied: false,
    },
    postedAt: null,
    purpose: 'DirectCorrection',
    reason: 'تسوية عجز إدخال بعد جرد المستودع المركزي',
    rowVersion: 2,
    status: 'Draft',
    warehouse: { id: '823e4567-e89b-42d3-a456-426614174008', displayName: 'المستودع المركزي' },
  }
}

function useDetailHandler(adjustment: InventoryAdjustment) {
  server.use(http.get(`*/api/v1/adjustments/${ADJUSTMENT_ID}`, () => HttpResponse.json(adjustment)))
}

function renderPage(permissionCodes: readonly string[] = ['document.view', 'document.create']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={[`/adjustments/${ADJUSTMENT_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
          <Route path="/adjustments" element={<p>القائمة</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AdjustmentDetailPage (e21-t07)', () => {
  it('renders the server read model: header fields, signed lines, gate blocker', async () => {
    useDetailHandler(draftFixture())
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: /تفاصيل سند التسوية/ }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/EIAMS-ADJ-DRAFT-0001/)).toBeInTheDocument()
    expect(screen.getByText('تسوية مباشرة')).toBeInTheDocument()
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
    expect(screen.getByText('عجز مؤكد بمراجعة اللجنة')).toBeInTheDocument()
    // SignedOriginal blocker surfaced from the embedded policy.
    expect(screen.getByText('يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.')).toBeInTheDocument()
  })

  it('shows the posting action to a manager on a Draft', async () => {
    useDetailHandler(draftFixture())
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeDisabled()
  })

  it('marks a posted disposal as terminal with no reversal affordance', async () => {
    const disposal = {
      ...draftFixture(),
      purpose: 'Disposal' as const,
      status: 'Posted' as const,
      postedAt: '2026-08-26T09:00:00.000Z',
      policy: {
        ...draftFixture().policy,
        actions: [],
        blockers: [],
        policyKind: 'Disposal' as const,
        signedOriginalSatisfied: true,
      },
    }
    useDetailHandler(disposal)
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('إعدام أصل')).toBeInTheDocument()
    expect(screen.getByText('سند إعدام مرحّل لا يقبل العكس')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'عكس السند' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })

  it('shows the error state when the detail request fails', async () => {
    server.use(
      http.get(`*/api/v1/adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json({ title: 'x' }, { status: 500 }),
      ),
    )
    renderPage()

    expect(await screen.findByText('تعذّر تحميل سند التسوية')).toBeInTheDocument()
  })
})
