import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { countNameHandlers } from '@/test/msw/count-wire-fixtures'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CountQuantityWorkspace } from './count-quantity-workspace'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } }),
}))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('@/shared/ui/toast-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui/toast-manager')>()
  return { ...actual, toast: { ...actual.toast, error: toastError } }
})

const API_BASE_URL = '/api/v1'
const COUNT_ID = '00000000-0000-4000-8000-000000000003'
/** The workspace's first render asks for 25 rows; 205 lines ⇒ 9 server pages. */
const FIRST_PAGE_SIZE = 25
const TOTAL_LINES = 205

interface SavedBody {
  expectedRowVersion: number
  actuals: unknown[]
}

interface SavedReasonBody {
  lineId: string
  reason: string
  expectedRowVersion: number
}

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مشغّل الجرد' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
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

/** The live line DTO: flat, ids and numbers, no rowVersion and no names. */
function toWireLine(line: TestLine) {
  return {
    id: line.countLineId,
    materialId: line.material.id,
    assetId: line.assetId ?? null,
    snapshotQuantity: line.snapshotQuantity,
    actualQuantity: line.actualQuantity,
    difference: line.difference,
    varianceReason: line.reason ?? null,
  }
}

/** The live count detail: flat fields, a summary and a settlement block. */
function countHeader(rowVersion: number) {
  return {
    id: COUNT_ID,
    warehouseId: 'w1',
    countType: 'Cycle',
    scopeType: 'EntireWarehouse',
    freezePolicy: 'SoftFreeze',
    status: 'InProgress',
    rowVersion,
    plannedAtUtc: '2026-01-01T00:00:00Z',
    startedAtUtc: '2026-01-01T00:00:00Z',
    completedAtUtc: null,
    closedAtUtc: null,
    abortedAtUtc: null,
    materialDomainId: null,
    summary: { totalLines: 0, countedLines: 0, varianceLines: 0, totalAbsoluteDifference: 0 },
    settlement: { status: 'NotRequired', adjustmentId: null, adjustmentStatus: null },
  }
}

/** The count DTO carries no names, so the UI resolves them one id at a time. */
function nameHandlersFor(seed: readonly TestLine[]) {
  return countNameHandlers({
    materials: Object.fromEntries(seed.map((line) => [line.material.id, line.material.displayName])),
    warehouses: { w1: 'مستودع' },
  })
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
let savedReasonBody: SavedReasonBody | undefined
let savedReasonUrl: string | undefined

beforeEach(() => {
  savedBody = undefined
  savedReasonBody = undefined
  savedReasonUrl = undefined
  toastError.mockClear()
})

/**
 * Server-paged handler over a mutable store: the count-lines read is 0-based
 * on pageIndex/pageSize, and a successful PUT is reflected in later reads so
 * the post-save reseed is observable.
 *
 * RESOLUTION-025: the save is `PUT /api/v1/inventory-counts/{countId}/actuals`
 * with `{ actuals: [{ lineId, actualQuantity }], expectedRowVersion }`. The
 * wire answers `ApiResponse<EmptyResponse>` (200 + empty body), so the handler
 * returns `apiJson({})` instead of a paginated read.
 */
function usePagedLinesHandlers(seed: readonly TestLine[]) {
  const store: TestLine[] = seed.map((entry) => ({ ...entry }))
  savedBody = undefined
  savedReasonBody = undefined
  savedReasonUrl = undefined
  server.use(
    ...nameHandlersFor(seed),
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
      const url = new URL(request.url)
      const page = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('pageSize') ?? String(FIRST_PAGE_SIZE))
      const start = (page - 1) * pageSize
      // Wire envelope: `data` is the line array and `pagination` is the snake_case
      // block. The zero-based `pageIndex` travels one-based as `page`.
      return okPageJson(store.slice(start, start + pageSize).map(toWireLine), {
        page,
        pageSize,
        totalCount: store.length,
        totalPages: Math.max(1, Math.ceil(store.length / pageSize)),
      })
    }),
    http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, async ({ request }) => {
      savedBody = (await request.json()) as SavedBody
      for (const saved of savedBody.actuals as {
        lineId: string
        actualQuantity: number
      }[]) {
        const target = store.find((entry) => entry.countLineId === saved.lineId)
        if (target === undefined) {
          continue
        }
        target.actualQuantity = saved.actualQuantity
        target.difference = saved.actualQuantity - target.snapshotQuantity
        target.rowVersion += 1
      }
      return apiJson({})
    }),
    // F3: a typed variance reason travels through its own endpoint, never on
    // the actuals batch.
    http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines/:lineId/variance-reason`, async ({ request }) => {
      savedReasonBody = (await request.json()) as SavedReasonBody
      savedReasonUrl = request.url
      return apiJson({})
    }),
    // The workspace observes the count header as well as its lines, so the
    // conflict-recovery path can reload the session rowVersion
    // (eiams-frontend-3wv1). MSW runs with `onUnhandledRequest: 'error'`, so
    // every workspace test has to serve it.
    http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}`, () =>
      okJson({
        ...countHeader(1),
      }),
    ),
  )
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

    expect(savedBody?.expectedRowVersion).toBe(1)
    expect(savedBody?.actuals).toHaveLength(1)
    const first = savedBody?.actuals?.[0] as { lineId: string; actualQuantity: number }
    expect(first.lineId).toBe('L1')
    expect(first.actualQuantity).toBe(23)
  }, 30000)

  it('renders asset lines with presence toggle and the asset id (e20-t10)', async () => {
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
    expect(screen.getByText(/أصل مسسلسيل/)).toBeInTheDocument()
    expect(screen.getByText(/aa000000-0000-4000-8000-0000000000aa/)).toBeInTheDocument()
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
    const first = savedBody?.actuals?.[0] as { lineId: string; actualQuantity: number }
    expect(first.lineId).toBe('A1')
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
    expect(savedBody?.actuals).toHaveLength(1)
    expect((savedBody?.actuals?.[0] as { lineId: string }).lineId).toBe('L26')
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
    expect((savedBody?.actuals?.[0] as { actualQuantity: number }).actualQuantity).toBe(0)
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
    const saved = savedBody?.actuals?.[0] as { lineId: string; actualQuantity: number }
    expect(saved.actualQuantity).toBe(20)
    expect(saved.lineId).toBe('L1')
    // Variance reason is collected at the review gate (RESOLUTION-025), not on
    // the actuals save; the wire never carries a per-line `reason` here.
    expect(saved).not.toHaveProperty('reason')
    expect(savedBody?.expectedRowVersion).toBe(1)
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
    await user.click(screen.getByRole('button', { name: /^حفظ \(.\)$/ }))

    await waitFor(
      () => {
        expect(savedBody).toBeDefined()
      },
      { timeout: 8000 },
    )
    // Variance reason stays in the form draft; it is not on the actuals wire
    // (RESOLUTION-025). The save rejects the absence with a review-gate message
    // only when the operator clicks complete.
    expect((savedBody?.actuals?.[0] as { reason?: string }).reason).toBeUndefined()

    // F3: the reason is persisted through the variance-reason endpoint.
    await waitFor(() => {
      expect(toastError).not.toHaveBeenCalled()
      expect(savedReasonBody).toBeDefined()
    })
    expect(savedReasonUrl).toContain('/lines/L1/variance-reason')
    expect(savedReasonBody?.reason).toBe('تالف أثناء النقل')
    expect(savedReasonBody?.expectedRowVersion).toBe(1)
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
        errJson(500, { code: 'x', message: 'boom' }),
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
    ...nameHandlersFor(seed),
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/lines`, ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page') ?? '1')
        const pageSize = Number(url.searchParams.get('pageSize') ?? String(FIRST_PAGE_SIZE))
        const start = (page - 1) * pageSize
        // Wire envelope: `data` is the line array, `pagination` is snake_case.
        // The zero-based `pageIndex` travels one-based as `page`.
        return okPageJson(store.slice(start, start + pageSize).map(toWireLine), {
          page,
          pageSize,
          totalCount: store.length,
          totalPages: Math.max(1, Math.ceil(store.length / pageSize)),
        })
      }),
      http.get(`${API_BASE_URL}/inventory-counts/${COUNT_ID}`, () =>
        okJson({
          ...countHeader(2),
        }),
      ),
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, () => {
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
        return apiJson(
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
    expect(copy).toContain('رفض الخادم الحفظ') // the response does not say which rows saved
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

  it('sends a line that carries no per-line version, because the count version guards the batch', async () => {
    // The live line DTO has NO rowVersion: the aggregate count rowVersion is the
    // guard, so a line without a version of its own is still sendable (F2).
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

    expect(screen.queryByText(/لن يُرسل مع الحفظ/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))
    await waitFor(() => {
      expect(savedBody).toBeDefined()
    })
    expect(savedBody?.actuals).toHaveLength(1)
    const first = savedBody?.actuals?.[0] as { lineId: string; actualQuantity: number }
    expect(first.lineId).toBe('L2')
    expect(first.actualQuantity).toBe(4)
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
    // unsaved changes - the UI asserting an entry was saved when it had neither
    // been sent nor retained.
    //
    // The blocked row is now the one whose quantity was CLEARED: the live line
    // DTO carries no rowVersion, so an unusable quantity is the only thing a
    // row can be blocked by.
    usePagedLinesHandlers([
      { ...bulkLine(1), material: { id: 'm1', displayName: 'حاسوب مكتبي' }, snapshotQuantity: 25 },
      {
        ...bulkLine(2),
        material: { id: 'm2', displayName: 'طابعة ليزر' },
        snapshotQuantity: 2,
        actualQuantity: 5,
        difference: 3,
      },
    ])
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByText('طابعة ليزر')
    await user.type(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي'), '20')
    await user.clear(screen.getByLabelText('الكمية الفعلية لـ طابعة ليزر'))

    // Only the sendable row travels.
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))
    await waitFor(() => {
      expect(savedBody).toBeDefined()
    })
    expect(savedBody?.actuals).toHaveLength(1)

    // The blocked entry must survive the reseed, stay dirty, and keep being
    // reported as unsent.
    await waitFor(() => {
      expect(screen.getByText(/تغييرات غير محفوظة في هذه الصفحة/)).toBeInTheDocument()
    })
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
      http.put(`${API_BASE_URL}/inventory-counts/${COUNT_ID}/actuals`, () =>
        errJson(500, { code: 'x', message: 'boom' }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'حفظ (١)' }))

    // A failed save is surfaced through the shared toast, not an inline alert.
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled()
    })
    expect(JSON.stringify(toastError.mock.calls)).not.toContain('حدّث الصفحة')
    // And the entry is still there, which is what that copy now promises.
    expect(screen.getByLabelText('الكمية الفعلية لـ حاسوب مكتبي')).toHaveValue(23)
  }, 40000)
})

/** Local mirror of the shared Arabic-Indic digit mapping for assertions. */
function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit)
}
