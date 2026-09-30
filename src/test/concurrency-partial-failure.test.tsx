import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { toast } from '@/shared/ui/toast-manager'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import type {
  DocumentPolicy,
  InventoryAdjustment,
  ProblemDetails,
  SessionResponse,
} from '@/shared/types/generated/eiams-v1'
import {
  createActionAvailability,
  createDocumentPolicy,
  createMaterial,
  createProblemDetails,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import { applyDocumentAction } from '@/test/msw/warehouse-document-handlers'
import { toWireErrorResponse } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

/**
 * Concurrency resilience and partial failure (e24-t09).
 *
 * Two different things are called "partial failure", and this suite keeps them
 * apart on purpose:
 *
 * - QUERY-level partial failure is REQUIRED behaviour. A page with several
 *   independent queries must model each one separately (SAD.md:230, D-AUD-02
 *   rule 6): one failed read degrades only its own surface, with a retryable
 *   Arabic error, and never hides the other surfaces.
 * - REQUEST-level partial application is FORBIDDEN. A lifecycle action is
 *   all-or-nothing on the server (D-LIFE-01 §94-97, §226 rule 5 "Never append
 *   a guessed event optimistically"). Nothing in the browser may simulate,
 *   approximate, or partially apply it.
 *
 * The suite covers the three defects verification found in the already
 * documented recovery contract; it adds no new concurrency infrastructure.
 */

vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import AdjustmentDetailPage from '@/modules/adjustment/pages/adjustment-detail-page'
import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000009a1'
const ADJUSTMENT_ID = '9d1e0000-0000-4000-8000-0000000000a1'

const PENDING_POLICY_NOTE = 'بانتظار تقييم سياسة المستند من الخادم...'
const POST_BUTTON_NAME = 'ترحيل السند'

/** Arabic conflict guidance owned by the adjustment actions module. */
const ADJUSTMENT_CONFLICT_GUIDANCE_AR = 'سند التسوية عدّله مستخدم آخر. أعد تحميل البيانات'

// The toast manager is module-mocked; its call history must not leak between
// cases or the "exactly one Arabic conflict message" assertions become order
// dependent.
beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

/**
 * The page renders other `role="alert"` regions (policy blockers, attachment
 * problems), so the policy-failure `ErrorState` is located by its own shared
 * slot rather than by role.
 */
function policyErrorState(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-slot="error-state"]')
}

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'concurrency.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    activeRoles: [],
  }
}

const ALL_DOCUMENT_CODES = [
  'document.view',
  'document.update',
  'document.submit',
  'document.post',
  'document.reject',
  'document.revise',
  'document.cancel',
  'document.reverse',
]

const ADJUSTMENT_CODES = ['document.view', 'document.post', 'document.reverse']

/**
 * Local query client with `retry: false` so a deliberately failing read settles
 * in one attempt. The production `createQueryClient()` uses `retry: 1` with no
 * `retryDelay`, which would add ~1s of real waiting per failure and make the
 * request counters non-deterministic.
 */
function createClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderDocumentDetail(client: QueryClient) {
  client.setQueryData(authSessionQueryKey, sessionWith(ALL_DOCUMENT_CODES))
  return render(<DocumentDetailPage />, {
    wrapper: function DocumentDetailWrapper() {
      return (
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/documents/receiving/${DOCUMENT_ID}`]}>
            <Routes>
              <Route path="/documents/receiving/:documentId" element={<DocumentDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    },
  })
}

function renderAdjustmentDetail(client: QueryClient) {
  client.setQueryData(authSessionQueryKey, sessionWith(ADJUSTMENT_CODES))
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/adjustments/${ADJUSTMENT_ID}`]}>
        <Routes>
          <Route path="/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function detailFixture() {
  return createWarehouseDocument({
    documentId: DOCUMENT_ID,
    documentType: 'Receiving',
    documentStatus: 'Draft',
    rowVersion: 1,
    systemReferenceNumber: 'EIAMS-DOC-2026-0901',
    paperDocumentNumber: '2026/0901',
    paperDocumentYear: 2026,
    lines: [
      createWarehouseDocumentLine({
        lineId: fixtureUuid(701),
        material: { ...createMaterial(), nameAr: 'حبر طابعة', code: 'IT-CON-INK-9A1' },
        quantity: 12,
      }),
    ],
  })
}

/** A Draft policy whose Submit is Enabled, so a recovered read yields a real button. */
function draftPolicy(): DocumentPolicy {
  return createDocumentPolicy({
    documentId: DOCUMENT_ID,
    documentStatus: 'Draft',
    actions: [
      createActionAvailability('Submit', { allowed: true, presentation: 'Enabled' }),
      createActionAvailability('Cancel', { allowed: true, presentation: 'Enabled' }),
    ],
  })
}

function adjustmentFixture(overrides: Partial<InventoryAdjustment> = {}): InventoryAdjustment {
  return {
    adjustmentId: ADJUSTMENT_ID,
    attachments: [],
    countReference: null,
    createdAt: '2026-08-26T08:00:00.000Z',
    createdBy: { id: fixtureUuid(909), displayName: 'مدير المستودع' },
    documentId: '00000000-0000-4000-8000-0000000009a2',
    documentReference: 'EIAMS-ADJ-DRAFT-9001',
    lines: [
      {
        adjustmentLineId: '00000000-0000-4000-8000-0000000009a3',
        material: { id: fixtureUuid(910), displayName: 'حبر طابعة' },
        quantityDelta: -2,
        reason: 'عجز مؤكد بمراجعة اللجنة',
      },
    ],
    policy: {
      actions: [
        {
          action: 'Post',
          allowed: true,
          confirmationRequired: false,
          presentation: 'Enabled',
          reasonAr: null,
          reasonCode: null,
          reasonRequired: false,
        },
      ],
      advisories: [],
      blockers: [],
      documentId: '00000000-0000-4000-8000-0000000009a2',
      documentStatus: 'Draft',
      evaluatedAt: '2026-08-26T08:05:00.000Z',
      policyKind: 'Adjustment',
      rowVersion: 1,
      signedOriginalSatisfied: true,
    },
    postedAt: null,
    purpose: 'DirectCorrection',
    reason: 'تسوية عجز إدخال بعد جرد المستودع المركزي',
    rowVersion: 1,
    status: 'Draft',
    warehouse: { id: fixtureUuid(911), displayName: 'المستودع المركزي' },
    ...overrides,
  }
}

/** 409 problem carrying the contract's Arabic conflict sentence. */
function adjustmentConflictProblem(): ProblemDetails {
  // The wire carries an English message only; the Arabic the user sees is resolved
  // from this code via the governed `error-copy-ar.ts` table.
  return createProblemDetails({
    code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    detailAr: null,
    fieldErrors: [],
    status: 409,
    titleAr: 'تغيرت البيانات. حدّث الصفحة ثم حاول مجدداً.',
  })
}

describe('F-1 — a failed policy read degrades only the policy-dependent surface (SAD.md:230)', () => {
  it('renders the document body, shows a retryable Arabic error instead of unexplained dead actions, and recovers on retry', async () => {
    const document = detailFixture()
    const policy = draftPolicy()
    let policyRequests = 0
    let policyShouldFail = true

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: document.documentStatus,
          currentRowVersion: document.rowVersion,
          events: deriveLifecycleEvents(document),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
        policyRequests += 1
        if (policyShouldFail) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json(policy)
      }),
    )

    const client = createClient()
    const { container } = renderDocumentDetail(client)

    // (a) The document read succeeded, so the whole document body still renders.
    expect(
      await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2026-0901/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('حبر طابعة')).toBeInTheDocument()
    expect(screen.getByText('2026/0901')).toBeInTheDocument()
    expect(screen.getAllByText('الإصدار: 1').length).toBeGreaterThan(0)

    // (b) The policy-dependent surface is a retryable Arabic error, not a
    //     "still waiting" note and not a row of unexplained disabled buttons.
    await waitFor(() => expect(policyErrorState(container)).not.toBeNull())
    const policyError = policyErrorState(container)!
    expect(policyError).toHaveTextContent('تعذّر تحميل سياسة السند')
    expect(policyError).toHaveTextContent('بيانات السند أعلاه صحيحة')
    expect(policyError).toHaveAttribute('role', 'alert')
    expect(screen.queryByText(PENDING_POLICY_NOTE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إرسال للترحيل' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إلغاء' })).not.toBeInTheDocument()
    // (d) No disabled lifecycle button is left with no explanation anywhere.
    const unexplainedDisabled = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('disabled'))
      .map((button) => button.textContent)
    expect(unexplainedDisabled).toEqual([])
    expect(policyRequests).toBe(1)

    // (c) The retry refetches the policy; when it then succeeds, the actions
    //     render exactly as the server presents them.
    policyShouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    const submit = await screen.findByRole('button', { name: 'إرسال للترحيل' })
    expect(submit).toBeEnabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeEnabled()
    expect(policyRequests).toBe(2)
    await waitFor(() => expect(policyErrorState(container)).toBeNull())
    expect(screen.queryByText(PENDING_POLICY_NOTE)).not.toBeInTheDocument()
  })

  it('keeps the loading note — not the error — while the policy read is merely pending', async () => {
    const document = detailFixture()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: document.documentStatus,
          currentRowVersion: document.rowVersion,
          events: deriveLifecycleEvents(document),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(draftPolicy()),
      ),
    )

    const client = createClient()
    const { container } = renderDocumentDetail(client)

    await screen.findByRole('button', { name: 'إرسال للترحيل' })
    expect(policyErrorState(container)).toBeNull()
    expect(screen.queryByText('تعذّر تحميل سياسة السند')).not.toBeInTheDocument()
  })
})

describe('F-2 — an adjustment retry reuses one idempotency key; a new action mints a new one', () => {
  it('sends the same Idempotency-Key on an explicit retry after an uncertain outcome, and a fresh key after success', async () => {
    const captured: (string | null)[] = []
    let committed = false
    let postCalls = 0

    server.use(
      http.get(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(adjustmentFixture()),
      ),
      http.post(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}/post`, async ({ request }) => {
        captured.push(request.headers.get(IDEMPOTENCY_KEY_HEADER))
        postCalls += 1
        if (!committed) {
          // Ambiguous transport outcome: the response is lost. The user has no
          // way to know whether the server applied the post.
          committed = true
          return HttpResponse.error()
        }
        return HttpResponse.json({ adjustmentId: ADJUSTMENT_ID, postedAt: null })
      }),
    )

    const client = createClient()
    renderAdjustmentDetail(client)

    const postButton = await screen.findByRole('button', { name: POST_BUTTON_NAME })
    fireEvent.click(postButton)
    await waitFor(() => expect(postCalls).toBe(1))

    // Explicit retry of the SAME user-approved action: the key must be reused
    // so the server can dedupe / replay instead of applying the post twice.
    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))
    await waitFor(() => expect(postCalls).toBe(2))
    expect(captured).toHaveLength(2)
    expect(captured[0]).toEqual(expect.any(String))
    expect(captured[1]).toBe(captured[0])

    // A distinct successful user action starts a NEW idempotency context.
    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))
    await waitFor(() => expect(postCalls).toBe(3))
    expect(captured).toHaveLength(3)
    expect(captured[2]).toEqual(expect.any(String))
    expect(captured[2]).not.toBe(captured[1])
  })

  it('keeps the same key across a 409 retry, so replay protection survives a version conflict', async () => {
    const captured: (string | null)[] = []
    let postCalls = 0

    server.use(
      http.get(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(adjustmentFixture()),
      ),
      http.post(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}/post`, async ({ request }) => {
        captured.push(request.headers.get(IDEMPOTENCY_KEY_HEADER))
        postCalls += 1
        if (postCalls === 1) {
          return toWireErrorResponse(adjustmentConflictProblem(), 409)
        }
        return HttpResponse.json({ adjustmentId: ADJUSTMENT_ID, postedAt: null })
      }),
    )

    const client = createClient()
    renderAdjustmentDetail(client)

    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))
    await waitFor(() => expect(postCalls).toBe(1))
    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))
    await waitFor(() => expect(postCalls).toBe(2))

    expect(captured[1]).toBe(captured[0])
  })
})

describe('F-3 — a 409 on an adjustment action refetches authoritative state and speaks Arabic', () => {
  it('refetches the authoritative adjustment read and shows the Arabic conflict message', async () => {
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(adjustmentFixture())
      }),
      http.post(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}/post`, () =>
        toWireErrorResponse(adjustmentConflictProblem(), 409),
      ),
    )

    const client = createClient()
    renderAdjustmentDetail(client)

    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    // D-LIFE-01 §226 rule 6: refetch authoritative state after a 409.
    await waitFor(() => expect(detailRequests).toBeGreaterThan(1))
    const [toastOptions] = (toast.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    // The Arabic comes from the governed table for the conflict code, and the
    // English wire message must never be shown to an Arabic-first UI.
    expect(JSON.stringify(toastOptions)).toContain(
      'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    )
    expect(JSON.stringify(toastOptions)).not.toContain('row version did not match')
    expect(JSON.stringify(toastOptions)).toContain('تغيرت البيانات')
  })

  it('falls back to the module Arabic conflict guidance when the 409 carries no Arabic detail', async () => {
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(adjustmentFixture())
      }),
      http.post(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}/post`, () =>
        // `detailAr: null` is contract-legal; the local guidance must be reachable.
        toWireErrorResponse(adjustmentConflictProblem(), 409),
      ),
    )

    const client = createClient()
    renderAdjustmentDetail(client)

    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(1))
    expect(
      (toast.error as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
        .calls[0]?.[0],
    ).toMatchObject({ description: ADJUSTMENT_CONFLICT_GUIDANCE_AR })
  })

  it('never auto-retries a 409 and never writes an optimistic state', async () => {
    let postCalls = 0
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(adjustmentFixture())
      }),
      http.post(`${API_BASE_URL}/adjustments/${ADJUSTMENT_ID}/post`, () => {
        postCalls += 1
        return toWireErrorResponse(adjustmentConflictProblem(), 409)
      }),
    )

    const client = createClient()
    renderAdjustmentDetail(client)

    fireEvent.click(await screen.findByRole('button', { name: POST_BUTTON_NAME }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    // Give any (forbidden) automatic retry a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(postCalls).toBe(1)
    // A rejected post never changes the rendered status: the server owns it.
    expect(screen.getAllByText('مسودة').length).toBeGreaterThan(0)
    expect(detailRequests).toBeGreaterThanOrEqual(1)
  })
})

describe('verify-only — the shared document lifecycle action path already complies', () => {
  it('refetches detail, policy and history after a 409 without automatically re-issuing the action', async () => {
    const store = { document: detailFixture() }
    let detailRequests = 0
    let policyRequests = 0
    let historyRequests = 0
    let submitCalls = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.document)
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
        historyRequests += 1
        return HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: store.document.documentStatus,
          currentRowVersion: store.document.rowVersion,
          events: deriveLifecycleEvents(store.document),
        })
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
        policyRequests += 1
        return HttpResponse.json(draftPolicy())
      }),
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`,
        async ({ request }) => {
          const body = (await request.json()) as { rowVersion: number }
          const outcome = applyDocumentAction({
            action: 'Submit',
            document: store.document,
            rowVersion: body.rowVersion,
          })
          if (outcome.kind !== 'ok') {
            return HttpResponse.json(outcome.problem, {
              status: outcome.kind === 'conflict' ? 409 : 422,
            })
          }
          submitCalls += 1
          return HttpResponse.json(outcome.result)
        },
      ),
    )

    const client = createClient()
    renderDocumentDetail(client)

    fireEvent.click(await screen.findByRole('button', { name: 'إرسال للترحيل' }))

    // Another actor edits the document, so this session's rowVersion is stale
    // and the submit is rejected by the server rather than applied.
    store.document = { ...store.document, rowVersion: 2 }

    const dialog = await screen.findByRole('alertdialog', { name: 'تعديل متزامن على السند' })
    expect(dialog).toBeInTheDocument()
    // A stale request changes nothing, and the UI never claims it did.
    expect(submitCalls).toBe(0)
    expect(screen.queryByText('بانتظار الترحيل')).not.toBeInTheDocument()

    const before = { detailRequests, policyRequests, historyRequests }
    fireEvent.click(screen.getByRole('button', { name: 'تحميل النسخة الأحدث' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'تعديل متزامن على السند' }),
      ).not.toBeInTheDocument(),
    )
    expect(detailRequests).toBeGreaterThan(before.detailRequests)
    expect(policyRequests).toBeGreaterThan(before.policyRequests)
    expect(historyRequests).toBeGreaterThan(before.historyRequests)
    // Recovery refetches; it never silently replays the user's stale action.
    expect(submitCalls).toBe(0)
  })
})
