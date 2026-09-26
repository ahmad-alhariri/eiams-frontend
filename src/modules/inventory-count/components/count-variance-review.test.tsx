import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

/** The whole-session review reads with this page size (hbfu). */
const REVIEW_PAGE_SIZE = 100

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

/** Server-paged handler: the review fans out over every page of the session. */
function useHandlers(lines: readonly unknown[]) {
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
      const url = new URL(request.url)
      const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
      const pageSize = Number(url.searchParams.get('pageSize') ?? String(REVIEW_PAGE_SIZE))
      const start = pageIndex * pageSize
      return HttpResponse.json({
        items: lines.slice(start, start + pageSize),
        meta: {
          pageIndex,
          pageSize,
          totalItems: lines.length,
          totalPages: Math.max(1, Math.ceil(lines.length / pageSize)),
        },
      })
    }),
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

describe('CountVarianceReview across server pages (hbfu)', () => {
  /**
   * 120 lines across 2 server pages. The unreasoned variance is the first line
   * of server page 2, so a gate computed from page 1 alone would wrongly allow
   * completion, and it sits on the review's third client page.
   */
  function pagedSession() {
    const matching = (countLineId: string, displayName: string) => ({
      countLineId,
      material: { id: countLineId, displayName },
      snapshotQuantity: 10,
      actualQuantity: 10,
      difference: 0,
      reason: null,
    })
    const serverPageOne = Array.from({ length: REVIEW_PAGE_SIZE }, (_unused, index) =>
      matching(`L${index + 1}`, `مادة ${index + 1}`),
    )
    const serverPageTwo = [
      {
        countLineId: 'X1',
        material: { id: 'mx1', displayName: 'شاشة محطمة' },
        snapshotQuantity: 4,
        actualQuantity: 2,
        difference: -2,
        reason: null,
      },
      ...Array.from({ length: 19 }, (_unused, index) =>
        matching(`P${index + 1}`, `مادة صفحة ثانية ${index + 1}`),
      ),
    ]
    return [...serverPageOne, ...serverPageTwo]
  }

  it('blocks completion on an unreasoned variance that lives beyond the first server page', async () => {
    useHandlers(pagedSession())
    const onComplete = vi.fn()
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete })

    // The summary counts the whole session, not just the first server page.
    await screen.findByText('مادة 1')
    expect(screen.getByText(/دون سبب:/).textContent).toBe('دون سبب: ١')
    const button = screen.getByRole('button', { name: 'إكمال الجلسة' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(
      screen.getByText(/لا يمكن إكمال الجلسة قبل إدخال سبب لكل بند ذي فرق/),
    ).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  }, 40000)

  it('makes a line from a later server page reachable through the review pagination', async () => {
    useHandlers(pagedSession())
    const user = userEvent.setup()
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    await screen.findByText('مادة 1')
    expect(screen.queryByText('شاشة محطمة')).toBeNull()
    expect(screen.getByText('عرض ١–٥٠ من ١٢٠')).toBeInTheDocument()

    // Server page 2 starts at overall index 100 ⇒ the review's third page.
    const next = screen.getByRole('button', { name: 'الصفحة التالية' })
    await user.click(next)
    await user.click(next)

    expect(await screen.findByText('شاشة محطمة')).toBeInTheDocument()
    expect(screen.getByText('لم يُدخل سبب الفرق بعد.')).toBeInTheDocument()
  }, 40000)

  it('refuses to review a session larger than the review read ceiling instead of truncating it', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(REVIEW_PAGE_SIZE))
        return HttpResponse.json({
          items: [],
          meta: {
            pageIndex,
            pageSize,
            totalItems: 10_001,
            totalPages: Math.ceil(10_001 / REVIEW_PAGE_SIZE),
          },
        })
      }),
    )
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('جلسة جرد أكبر من حدود المراجعة')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إكمال الجلسة' })).toBeNull()
  }, 40000)

  it('surfaces a retryable error when the session read fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json({ error: { code: 'x', message: 'boom' } }, { status: 500 }),
      ),
    )
    renderReview({ permissions: ['count.complete'], canComplete: true, onComplete: vi.fn() })

    expect(await screen.findByText('تعذّر تحميل بنود الفروقات')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  }, 40000)
})
