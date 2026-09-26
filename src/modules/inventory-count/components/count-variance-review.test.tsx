import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { CountVarianceReview } from '@/modules/inventory-count/components/count-variance-review'
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
  canClose?: boolean
  onClose?: () => void
  isClosing?: boolean
  closeError?: string | null
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', ...opts.permissions]))
  return render(
    <QueryClientProvider client={client}>
      <CountVarianceReview
        countId={COUNT_ID}
        canComplete={opts.canComplete}
        canClose={opts.canClose ?? false}
        onComplete={opts.onComplete}
        onClose={opts.onClose ?? vi.fn()}
        isCompleting={opts.isCompleting ?? false}
        isClosing={opts.isClosing ?? false}
        completeError={opts.completeError ?? null}
        closeError={opts.closeError ?? null}
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
const assetLineMissing = {
  countLineId: 'A1',
  assetId: 'aa000000-0000-4000-8000-0000000000aa',
  assetNumber: 'AST-1001',
  material: { id: 'm9', displayName: 'حاسوب محمول' },
  snapshotQuantity: 1,
  actualQuantity: 0,
  difference: -1,
  reason: 'مفقود أثناء النقل',
}

describe('CountVarianceReview (e20-t07)', () => {
  it('keeps unentered actuals separate and blocks premature completion without inventing shortages', async () => {
    useHandlers([
      { ...varianceWithReason, actualQuantity: null, difference: 0, reason: null },
      { ...assetLineMissing, actualQuantity: undefined, difference: 0, reason: null },
    ])
    const onComplete = vi.fn()
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete })

    await screen.findByText('بنود لم تُدخل كمياتها الفعلية')
    expect(screen.getByText(/لم تُدخل بعد:/)).toHaveTextContent('2')
    expect(screen.getByText(/مطابقة:/)).toHaveTextContent('0')
    expect(screen.getByText(/ذات فرق:/)).toHaveTextContent('0')
    expect(screen.getByText(/دون سبب:/)).toHaveTextContent('0')
    expect(screen.queryByText(/\(-25\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/لا يمكن إكمال الجلسة قبل إدخال الكمية الفعلية/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'إكمال الجلسة' }))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('uses the authoritative difference instead of recalculating it from displayed quantities', async () => {
    useHandlers([{ ...varianceWithReason, actualQuantity: 0, difference: 3 }])
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    const line = (await screen.findByText('حاسوب مكتبي')).closest('li')!
    expect(within(line).getByText(/\(\+3\)/)).toBeVisible()
    expect(within(line).queryByText(/\(-25\)/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إكمال الجلسة' })).toBeEnabled()
  })

  it('splits matching vs variance lines and shows reasons', async () => {
    useHandlers([matchingLine, varianceWithReason])
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('ورق تصوير A4')).toBeInTheDocument()
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText(/تالف ولم يُرصد/)).toBeInTheDocument()
    // 1 variance line → complete allowed
    expect(screen.getByRole('button', { name: 'إكمال الجلسة' })).toBeEnabled()
  }, 20000)

  it('includes a variance line returned after the first 200 lines', async () => {
    const requestedPages: number[] = []
    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      ...matchingLine,
      countLineId: `matching-${index}`,
    }))
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const pageIndex = Number(new URL(request.url).searchParams.get('pageIndex'))
        requestedPages.push(pageIndex)
        return HttpResponse.json({
          items: pageIndex === 0 ? firstPage : [varianceWithoutReason],
          meta: { pageIndex, pageSize: 200, totalItems: 201, totalPages: 2 },
        })
      }),
    )
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('طابعة ليزر')).toBeInTheDocument()
    expect(screen.getByText(/إجمالي البنود:/)).toHaveTextContent('201')
    expect(screen.getByRole('button', { name: 'إكمال الجلسة' })).toBeDisabled()
    expect(requestedPages).toEqual([0, 1])
  }, 20000)

  it('does not publish a partial count when a later page fails and permits retry', async () => {
    let failLaterPage = true
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const pageIndex = Number(new URL(request.url).searchParams.get('pageIndex'))
        if (pageIndex === 1 && failLaterPage) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json({
          items: pageIndex === 0 ? [matchingLine] : [varianceWithReason],
          meta: { pageIndex, pageSize: 1, totalItems: 2, totalPages: 2 },
        })
      }),
    )
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(
      await screen.findByText('لم يكتمل تحميل جميع صفحات البنود. حاول مرة أخرى.'),
    ).toBeVisible()
    expect(screen.queryByText('ورق تصوير A4')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إكمال الجلسة' })).not.toBeInTheDocument()

    failLaterPage = false
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByText('حاسوب مكتبي')).toBeVisible()
    expect(screen.getByText('ورق تصوير A4')).toBeVisible()
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

  it('shows the close action on Completed status with count.close permission', async () => {
    useHandlers([matchingLine, varianceWithReason])
    const onClose = vi.fn()
    renderReview({
      permissions: ['count.complete', 'count.close'],
      canComplete: false,
      canClose: true,
      onComplete: vi.fn(),
      onClose,
    })

    await screen.findByText('حاسوب مكتبي')
    expect(screen.getByRole('button', { name: 'إغلاق الجلسة' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إكمال الجلسة' })).not.toBeInTheDocument()
  }, 20000)

  it('surfaces asset lines with serial badge and asset number (e20-t10)', async () => {
    useHandlers([assetLineMissing])
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('حاسوب محمول')).toBeInTheDocument()
    expect(screen.getByText(/أصل مسلسل/)).toBeInTheDocument()
    expect(screen.getByText(/AST-1001/)).toBeInTheDocument()
    expect(screen.getByText(/مفقود أثناء النقل/)).toBeInTheDocument()
  }, 20000)

  it('hides the close action when not on Completed status', async () => {
    useHandlers([matchingLine, varianceWithReason])
    renderReview({
      permissions: ['count.close'],
      canComplete: true,
      canClose: false,
      onComplete: vi.fn(),
      onClose: vi.fn(),
    })

    await screen.findByText('حاسوب مكتبي')
    expect(screen.queryByRole('button', { name: 'إغلاق الجلسة' })).toBeNull()
  }, 20000)
})
