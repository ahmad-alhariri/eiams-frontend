import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { CountVarianceReview } from './count-variance-review'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000007'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'count.operator',
      displayName: 'مشغّل الجرد',
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

function useHandlers(lines: unknown[]) {
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
      HttpResponse.json({
        items: lines,
        meta: { pageIndex: 0, pageSize: 200, totalItems: lines.length, totalPages: 1 },
      }),
    ),
  )
}

function renderReview(opts: {
  permissions: readonly string[]
  canComplete: boolean
  onComplete: () => void
  isCompleting?: boolean
  completeError?: string | null
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', ...opts.permissions]))
  return render(
    <QueryClientProvider client={client}>
      <CountVarianceReview
        countId={COUNT_ID}
        canComplete={opts.canComplete}
        onComplete={opts.onComplete}
        isCompleting={opts.isCompleting ?? false}
        completeError={opts.completeError ?? null}
      />
    </QueryClientProvider>,
  )
}

const matchingLine = {
  countLineId: 'L1',
  material: { id: 'm1', displayName: 'ورق تصوير A4' },
  snapshotQuantity: 12,
  actualQuantity: 12,
  difference: 0,
  reason: null,
}
const varianceWithReason = {
  countLineId: 'L2',
  material: { id: 'm2', displayName: 'حاسوب مكتبي' },
  snapshotQuantity: 25,
  actualQuantity: 23,
  difference: -2,
  reason: 'تالف ولم يُرصد',
}
const varianceWithoutReason = {
  countLineId: 'L3',
  material: { id: 'm3', displayName: 'طابعة ليزر' },
  snapshotQuantity: 2,
  actualQuantity: 5,
  difference: 3,
  reason: null,
}

describe('CountVarianceReview (e20-t07)', () => {
  it('splits matching vs variance lines and shows reasons', async () => {
    useHandlers([matchingLine, varianceWithReason])
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('ورق تصوير A4')).toBeInTheDocument()
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText(/تالف ولم يُرصد/)).toBeInTheDocument()
    // 1 variance line → complete allowed
    expect(screen.getByRole('button', { name: 'إكمال الجلسة' })).toBeEnabled()
  }, 20000)

  it('blocks complete when a variance line lacks a reason', async () => {
    useHandlers([matchingLine, varianceWithoutReason])
    const onComplete = vi.fn()
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete })

    await screen.findByText('طابعة ليزر')
    const button = screen.getByRole('button', { name: 'إكمال الجلسة' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/لا يمكن إكمال الجلسة قبل إدخال سبب/)).toBeInTheDocument()
  }, 20000)

  it('hides the complete action without count.complete permission', async () => {
    useHandlers([matchingLine, varianceWithReason])
    const onComplete = vi.fn()
    renderReview({ permissions: [], canComplete: false, onComplete })

    await screen.findByText('حاسوب مكتبي')
    expect(screen.queryByRole('button', { name: 'إكمال الجلسة' })).toBeNull()
  }, 20000)
})
