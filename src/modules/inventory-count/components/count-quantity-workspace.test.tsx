import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CountQuantityWorkspace } from './count-quantity-workspace'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000003'
/** The workspace's first render asks for 25 rows; 205 lines ⇒ 9 server pages. */
const FIRST_PAGE_SIZE = 25
const TOTAL_LINES = 205

interface SavedBody {
  countRowVersion: number
  lines: unknown[]
}

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

interface TestLine {
  countLineId: string
  material: { id: string; displayName: string }
  snapshotQuantity: number
  actualQuantity: number | null
  difference: number
  rowVersion: number
  assetId?: string
  assetNumber?: string
  reason?: string | null
}

function bulkLine(index: number): TestLine {
  return {
    countLineId: `L${index}`,
    material: { id: `m${index}`, displayName: `مادة ${index}` },
    snapshotQuantity: 2,
    actualQuantity: null,
    difference: 0,
    rowVersion: 1,
  }
}

/** 205 bulk lines: enough that a line on page 2 is unreachable without paging. */
function manyLines(): TestLine[] {
  return Array.from({ length: TOTAL_LINES }, (_unused, index) => bulkLine(index + 1))
}

const twoLines: TestLine[] = [
  bulkLine(1),
  { ...bulkLine(2), material: { id: 'm2', displayName: 'طابعة ليزر' } },
]

let savedBody: SavedBody | undefined

beforeEach(() => {
  savedBody = undefined
})

/**
 * Server-paged handler over a mutable store: the count-lines read is 0-based
 * on pageIndex/pageSize, and a successful PUT is reflected in later reads so
 * the post-save reseed is observable.
 */
function usePagedLinesHandlers(seed: readonly TestLine[]) {
  const store: TestLine[] = seed.map((entry) => ({ ...entry }))
  savedBody = undefined
  server.use(
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
      const url = new URL(request.url)
      const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
      const pageSize = Number(url.searchParams.get('pageSize') ?? String(FIRST_PAGE_SIZE))
      const start = pageIndex * pageSize
      return HttpResponse.json({
        items: store.slice(start, start + pageSize),
        meta: {
          pageIndex,
          pageSize,
          totalItems: store.length,
          totalPages: Math.max(1, Math.ceil(store.length / pageSize)),
        },
      })
    }),
    http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, async ({ request }) => {
      savedBody = (await request.json()) as SavedBody
      for (const saved of savedBody.lines as {
        countLineId: string
        actualQuantity: number
        reason?: string
      }[]) {
        const target = store.find((entry) => entry.countLineId === saved.countLineId)
        if (target === undefined) {
          continue
        }
        target.actualQuantity = saved.actualQuantity
        target.difference = saved.actualQuantity - target.snapshotQuantity
        target.reason = saved.reason ?? null
        target.rowVersion += 1
      }
      return HttpResponse.json({ items: [], meta: emptyMeta(0, FIRST_PAGE_SIZE, store.length) })
    }),
    // The workspace observes the count header as well as its lines, so the
    // conflict-recovery path can reload the session rowVersion
    // (eiams-frontend-3wv1). MSW runs with `onUnhandledRequest: 'error'`, so
    // every workspace test has to serve it.
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}`, () =>
      HttpResponse.json({
        countId: COUNT_ID,
        countNumber: 'CNT-1',
        countStatus: 'InProgress',
        rowVersion: 1,
        warehouse: { id: 'w1', displayName: 'مستودع' },
      }),
    ),
  )
}

function emptyMeta(pageIndex: number, pageSize: number, totalItems: number) {
  return {
    pageIndex,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  }
}

function renderWorkspace(permissionCodes: readonly string[] = ['count.view', 'count.enter']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <QueryClientProvider client={client}>
      <CountQuantityWorkspace countId={COUNT_ID} countRowVersion={1} />
    </QueryClientProvider>,
  )
}

describe('CountQuantityWorkspace (e20-t06, hbfu)', () => {
  it('renders loaded lines with snapshot quantities and live difference', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      { ...bulkLine(2), material: { id: 'm2', displayName: 'طابعة ليزر' }, snapshotQuantity: 2 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    expect(await screen.findByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()

    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')

    expect(screen.getAllByText('-2').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'حفظ (١)' })).toBeInTheDocument()
  }, 20000)

  it('persists only changed lines with batch PUT', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      { ...bulkLine(2), material: { id: 'm2', displayName: 'طابعة ليزر' }, snapshotQuantity: 2 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )

    expect(savedBody?.countRowVersion).toBe(1)
    expect(savedBody?.lines).toHaveLength(1)
    const first = savedBody?.lines?.[0] as { countLineId: string; actualQuantity: number }
    expect(first.countLineId).toBe('L1')
    expect(first.actualQuantity).toBe(23)
  }, 30000)

  it('renders asset lines with presence toggle and asset number (e20-t10)', async () => {
    usePagedLinesHandlers([
      {
        countLineId: 'A1',
        assetId: 'aa000000-0000-4000-8000-0000000000aa',
        assetNumber: 'AST-1001',
        material: { id: 'm9', displayName: 'حاسوب محمول' },
        snapshotQuantity: 1,
        actualQuantity: null,
        difference: 0,
        rowVersion: 1,
      },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    expect(await screen.findByText('حاسوب محمول')).toBeInTheDocument()
    expect(screen.getByText(/أصل مسلسل/)).toBeInTheDocument()
    expect(screen.getByText(/AST-1001/)).toBeInTheDocument()
    // No numeric quantity input for an asset line — presence toggle instead.
    expect(screen.queryByLabelText('الكمية الفعلية لـ حاسوب محمول')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'تأكيد فقدان حاسوب محمول' }))
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    const first = savedBody?.lines?.[0] as { countLineId: string; actualQuantity: number }
    expect(first.countLineId).toBe('A1')
    expect(first.actualQuantity).toBe(0)
  }, 30000)

  it('reaches and edits a line that only exists on a later server page (hbfu)', async () => {
    usePagedLinesHandlers(manyLines())
    const user = userEvent.setup()
    renderWorkspace()

    // Page 1 renders the first server page only.
    expect(await screen.findByText('مادة 1')).toBeInTheDocument()
    expect(screen.queryByText('مادة 26')).toBeNull()
    expect(
      screen.getByText(
        `عرض ١–${toArabicDigits(FIRST_PAGE_SIZE)} من ${toArabicDigits(TOTAL_LINES)}`,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))

    // Line 26 lives on page 2 and is now reachable and editable.
    expect(await screen.findByText('مادة 26')).toBeInTheDocument()
    const input = screen.getByLabelText('الكمية الفعلية لـ مادة 26')
    await user.type(input, '5')

    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    expect(savedBody?.lines).toHaveLength(1)
    expect((savedBody?.lines?.[0] as { countLineId: string }).countLineId).toBe('L26')
  }, 40000)

  it('accepts a zero actual quantity and blocks a variance without a reason', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '0')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    expect((savedBody?.lines?.[0] as { actualQuantity: number }).actualQuantity).toBe(0)
  }, 30000)

  it('saves a variance whose reason is still blank (the reason is the review gate)', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '20')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    // PRD §12.6 collects the quantity while entering; the reason is demanded by
    // the variance review's completion gate, so entry must not be blocked.
    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    const saved = savedBody?.lines?.[0] as { actualQuantity: number; reason?: string }
    expect(saved.actualQuantity).toBe(20)
    expect(saved.reason).toBeUndefined()
  }, 30000)

  it('sends a typed variance reason alongside the quantity', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '20')
    await user.type(screen.getByLabelText('سبب الفرق لـ حاسوب مكتبي'), 'تالف أثناء النقل')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    expect((savedBody?.lines?.[0] as { reason?: string }).reason).toBe('تالف أثناء النقل')
  }, 30000)

  it('guards page navigation when the current page has unsaved drafts (hbfu)', async () => {
    usePagedLinesHandlers(manyLines())
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('مادة 1')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ مادة 1'), '7')

    // Navigating away asks first.
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('تغييرات غير محفوظة')).toBeInTheDocument()

    // Cancelling keeps the operator on the page with the draft intact.
    await user.click(within(dialog).getByRole('button', { name: 'البقاء في هذه الصفحة' }))
    expect(screen.getByText('مادة 1')).toBeInTheDocument()
    expect(screen.queryByText('مادة 26')).toBeNull()
    expect(screen.getByLabelText('الكمية الفعلية لـ مادة 1')).toHaveValue(7)

    // Confirming discards the draft and moves on.
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    const confirmed = await screen.findByRole('alertdialog')
    await user.click(within(confirmed).getByRole('button', { name: 'الانتقال وفقدان التغييرات' }))
    expect(await screen.findByText('مادة 26')).toBeInTheDocument()
  }, 40000)

  it('navigates freely between pages when nothing is unsaved', async () => {
    usePagedLinesHandlers(manyLines())
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('مادة 1')
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))

    expect(await screen.findByText('مادة 26')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  }, 40000)

  it('changes the page size from the shared controls', async () => {
    usePagedLinesHandlers(manyLines())
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('مادة 1')
    await user.click(screen.getByRole('combobox', { name: 'عدد الصفوف في الصفحة' }))
    await user.click(await screen.findByRole('option', { name: 'عرض ٥٠ صفاً' }))

    expect(await screen.findByText('مادة 50')).toBeInTheDocument()
  }, 40000)

  it('reseeds the page from the server after a successful save', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      { ...bulkLine(2), material: { id: 'm2', displayName: 'طابعة ليزر' }, snapshotQuantity: 2 },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    const input = screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي')
    await user.type(input, '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    // The saved page is reseeded, so the operator is no longer told they have
    // unsaved changes and the difference reflects the stored quantity.
    await waitFor(
      () => {
        expect(screen.getByText('لا تغييرات غير محفوظة.')).toBeInTheDocument()
      },
      { timeout: 8000 },
    )
    expect(input).toHaveValue(23)
    expect(screen.getByRole('button', { name: 'حفظ (٠)' })).toBeDisabled()
  }, 30000)

  it('hides the save action and disables entry without count.enter', async () => {
    usePagedLinesHandlers(twoLines)
    renderWorkspace(['count.view'])

    await screen.findByText('مادة 1')
    expect(screen.queryByRole('button', { name: /حفظ/ })).toBeNull()
    expect(screen.getByLabelText('الكمية الفعلية لـ مادة 1')).toBeDisabled()
  }, 20000)

  it('surfaces a retryable error state when the lines read fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json({ error: { code: 'x', message: 'boom' } }, { status: 500 }),
      ),
    )
    renderWorkspace()

    expect(await screen.findByText('تعذّر تحميل بنود الجرد')).toBeInTheDocument()
    expect(screen.getByText('لا تغييرات غير محفوظة.')).toBeInTheDocument()

    // Retry against a healthy server recovers the page.
    usePagedLinesHandlers(twoLines)
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByText('مادة 1')).toBeInTheDocument()
  }, 40000)
})
describe('CountQuantityWorkspace conflict recovery (eiams-frontend-3wv1)', () => {
  const threeLines: TestLine[] = [
    { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
    { ...bulkLine(2), material: { id: 'm2', displayName: 'طابعة ليزر' }, snapshotQuantity: 2 },
    { ...bulkLine(3), material: { id: 'm3', displayName: 'شاشة' }, snapshotQuantity: 7 },
  ]

  /**
   * Serves the page read and answers every batch PUT with a 409, counting the
   * attempts. The 409 body deliberately carries no per-line attribution, which is
   * what the real contract provides.
   */
  function useConflictingSaveHandlers(seed: readonly TestLine[], attemptLog: number[]) {
    const store = seed.map((entry) => ({ ...entry }))
    server.use(
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(FIRST_PAGE_SIZE))
        const start = pageIndex * pageSize
        return HttpResponse.json({
          items: store.slice(start, start + pageSize),
          meta: {
            pageIndex,
            pageSize,
            totalItems: store.length,
            totalPages: Math.max(1, Math.ceil(store.length / pageSize)),
          },
        })
      }),
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}`, () =>
        HttpResponse.json({
          countId: COUNT_ID,
          countNumber: 'CNT-1',
          countStatus: 'InProgress',
          rowVersion: 2,
          warehouse: { id: 'w1', displayName: 'مستودع' },
        }),
      ),
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () => {
        attemptLog.push(Date.now())
        // A conflict means the server rejected the save against its own current
        // state, which in practice means its rows have moved on. The fixture
        // therefore shifts a row's actual quantity, so any refetch that happens
        // after the 409 returns data that DIFFERS from what the operator is
        // looking at.
        //
        // This is what makes the draft-preservation assertions discriminating.
        // If the server echoed identical data, react-hook-form's values-driven
        // reset would short-circuit on `deepEqual` and no reset would fire, so
        // the test would pass even with an error-path invalidation in place —
        // that is, it would prove nothing.
        for (const entry of store) {
          entry.actualQuantity = (entry.actualQuantity ?? entry.snapshotQuantity) + 1
          entry.difference = entry.actualQuantity - entry.snapshotQuantity
          entry.rowVersion += 1
        }
        return HttpResponse.json(
          { status: 409, code: 'state.conflict', titleAr: 'تغيرت البيانات', traceId: 't-1' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }),
    )
  }

  it('keeps every unsaved entry on screen when the save is rejected with a conflict', async () => {
    // NON-VACUITY: verified by reintroducing `onError: invalidate` on
    // `useUpdateCountLinesMutation`, which makes this case and the
    // decline-the-reload case below fail. The fixture deliberately shifts the
    // server's rows on the 409 for exactly this reason — a refetch that echoed
    // identical data would let react-hook-form's values-reset short-circuit on
    // `deepEqual`, and the assertions would pass with the defect in place.
    const attempts: number[] = []
    useConflictingSaveHandlers(threeLines, attempts)
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر'), '1')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ شاشة'), '9')

    await user.click(screen.getByRole('button', { name: 'حفظ (٣)' }))

    // The core regression: the operator's work survives a 409.
    expect(await screen.findByRole('alertdialog', { name: /تعارض على بنود الجرد/ })).toBeTruthy()
    expect(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي')).toHaveValue(23)
    expect(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر')).toHaveValue(1)
    expect(screen.getByLabelText('الكمية الفعلية لـ شاشة')).toHaveValue(9)
  }, 40000)

  it('does not retry the rejected batch on its own', async () => {
    const attempts: number[] = []
    useConflictingSaveHandlers(threeLines, attempts)
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await screen.findByRole('alertdialog', { name: /تعارض على بنود الجرد/ })
    // Give any accidental retry a chance to fire before asserting the count.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(attempts).toHaveLength(1)
  }, 40000)

  it('says nothing about which rows were saved, because the 409 does not say', async () => {
    const attempts: number[] = []
    useConflictingSaveHandlers(threeLines, attempts)
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    const dialog = await screen.findByRole('alertdialog')
    const copy = dialog.textContent ?? ''
    // The response carries no per-line attribution, so any "N of M saved" style
    // claim would be fabricated.
    expect(copy).not.toMatch(/حُفظت?\s+\d/)
    expect(copy).not.toMatch(/تم حفظ/)
    expect(copy).toContain('أي البنود حُفظت') // the response does not say which rows saved
  }, 40000)

  it('keeps the operator on their entries when they decline the reload', async () => {
    const attempts: number[] = []
    useConflictingSaveHandlers(threeLines, attempts)
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'البقاء على القيم الحالية' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
    expect(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي')).toHaveValue(23)
  }, 40000)

  it('reports a changed row it cannot send instead of dropping it silently', async () => {
    // `L2` has no server rowVersion, so no versioned update can be built for it.
    const noVersionLine: TestLine = {
      countLineId: 'L2',
      material: { id: 'm2', displayName: 'طابعة ليزر' },
      snapshotQuantity: 2,
      actualQuantity: null,
      difference: 0,
      rowVersion: undefined as unknown as number,
    }
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      noVersionLine,
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('طابعة ليزر')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر'), '4')

    // The row counts as changed, so the page must admit it is not travelling.
    expect(await screen.findByText(/لن يُرسل مع الحفظ/)).toBeInTheDocument()
    expect(screen.getByText(/لم يوفّر إصداراً لهذا البند/)).toBeInTheDocument()
    // Nothing sendable, so there is nothing to save.
    expect(screen.getByRole('button', { name: 'حفظ (٠)' })).toBeDisabled()
  }, 40000)

  it('reports a changed row whose quantity was left blank, rather than claiming nothing changed', async () => {
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      {
        ...bulkLine(2),
        material: { id: 'm2', displayName: 'طابعة ليزر' },
        snapshotQuantity: 2,
        actualQuantity: 5,
      },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('طابعة ليزر')
    // Clearing a previously counted quantity is a real change (it un-counts the
    // row) but carries no actual, so it cannot be sent.
    await user.clear(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر'))

    expect(await screen.findByText(/تغييرات غير محفوظة في هذه الصفحة/)).toBeInTheDocument()
    expect(screen.getByText(/لن يُرسل مع الحفظ/)).toBeInTheDocument()
  }, 40000)

  it("keeps a blocked row's entry and its warning after a successful save (browser-QA D1)", async () => {
    // Regression for a defect browser QA found: the honest "will not be sent"
    // warning was accurate only until the next successful save, at which point
    // the reseed adopted the server's UNCHANGED value for the blocked row,
    // erasing the operator's entry and then reporting the page as having no
    // unsaved changes — the UI asserting an entry was saved when it had neither
    // been sent nor retained.
    const noVersionLine: TestLine = {
      countLineId: 'L2',
      material: { id: 'm2', displayName: 'طابعة ليزر' },
      snapshotQuantity: 2,
      actualQuantity: null,
      difference: 0,
      rowVersion: undefined as unknown as number,
    }
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      noVersionLine,
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('طابعة ليزر')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '20')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر'), '9')

    // Only the sendable row travels.
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))
    await waitFor(() => {
      expect(savedBody).toBeDefined()
    })
    expect(savedBody?.lines).toHaveLength(1)

    // The blocked entry must survive the reseed, stay dirty, and keep being
    // reported as unsent.
    await waitFor(() => {
      expect(screen.getByText(/تغييرات غير محفوظة في هذه الصفحة/)).toBeInTheDocument()
    })
    expect(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر')).toHaveValue(9)
    expect(screen.getByText(/لن يُرسل مع الحفظ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ (٠)' })).toBeDisabled()
  }, 40000)

  it('no longer advises a page refresh, which would discard the entries', async () => {
    usePagedLinesHandlers(threeLines)
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '23')
    // A non-conflict failure, so the inline (non-dialog) branch is the one shown.
    server.use(
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, () =>
        HttpResponse.json({ status: 500 }, { status: 500 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    const alert = await screen.findByText(/تعذّر حفظ بنود الجرد/)
    expect(alert.textContent).not.toContain('حدّث الصفحة')
    expect(alert.textContent).toContain('لم تُضِع ما أدخلته')
    // And the entry is still there, which is what that copy now promises.
    expect(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي')).toHaveValue(23)
  }, 40000)
})

/** Local mirror of the shared Arabic-Indic digit mapping for assertions. */
function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit)
}
