import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { environment } from '@/config/env'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { LifecycleActionKind } from '@/shared/documents/use-document-lifecycle-actions'
import type {
  DocumentLifecycleEvent,
  ReasonedDocumentActionRequest,
  SessionResponse,
  VersionOnlyDocumentActionRequest,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import { Toaster } from '@/shared/ui/toaster'
import {
  createDocumentPolicy,
  createLifecycleEvent,
  createWarehouseDocument,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { applyDocumentAction } from '@/test/msw/warehouse-document-handlers'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import DocumentDetailPage from './document-detail-page'

const API_BASE_URL = environment.apiBaseUrl
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000002bc'

const LIFECYCLE_ACTIONS: readonly LifecycleActionKind[] = [
  'Submit',
  'Post',
  'Reject',
  'Revise',
  'Cancel',
  'Reverse',
]

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

const DROPZONE_LABEL_AR = 'اسحب وأفلت الملف هنا أو انقر للاختيار'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'document.manager',
      displayName: 'مدير المستندات',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      {
        scopeType: 'Warehouse',
        scopeId: '00000000-0000-4000-8000-00000000000c',
        displayName: 'المستودع المركزي',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function createJourneyWrapper(permissionCodes: readonly string[] = ALL_DOCUMENT_CODES) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

  return function JourneyWrapper() {
    return (
      <QueryClientProvider client={client}>
        <Toaster />
        <MemoryRouter initialEntries={[`/documents/receiving/${DOCUMENT_ID}`]}>
          <Routes>
            <Route path="/documents/receiving/:documentId" element={<DocumentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

interface MutableJourney {
  documents: WarehouseDocument[]
  events: DocumentLifecycleEvent[]
  actionCalls: Record<LifecycleActionKind, number>
  capturedKeys: Record<LifecycleActionKind, (string | null)[]>
}

function useMutableJourney(delayMs = 0): MutableJourney {
  const journey: MutableJourney = {
    documents: [
      createWarehouseDocument({
        documentId: DOCUMENT_ID,
        documentStatus: 'Draft',
        rowVersion: 1,
        policy: createDocumentPolicy({
          documentId: DOCUMENT_ID,
          documentStatus: 'Draft',
          rowVersion: 1,
          signedOriginalSatisfied: true,
        }),
      }),
    ],
    events: [
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 1,
        eventType: 'Created',
        occurredAt: '2026-01-01T00:00:00.000Z',
        toStatus: 'Draft',
      }),
    ],
    actionCalls: { Submit: 0, Post: 0, Reject: 0, Revise: 0, Cancel: 0, Reverse: 0 },
    capturedKeys: { Submit: [], Post: [], Reject: [], Revise: [], Cancel: [], Reverse: [] },
  }

  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
      HttpResponse.json(journey.documents[0]),
    ),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
      HttpResponse.json({
        documentId: DOCUMENT_ID,
        currentStatus: journey.documents[0]?.documentStatus ?? 'Draft',
        currentRowVersion: journey.documents[0]?.rowVersion ?? 0,
        events: journey.events,
      }),
    ),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
      HttpResponse.json(journey.documents[0]?.policy),
    ),
  )

  for (const action of LIFECYCLE_ACTIONS) {
    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/${action.toLowerCase()}`,
        async ({ request }) => {
          journey.actionCalls[action] += 1
          journey.capturedKeys[action].push(request.headers.get('Idempotency-Key'))
          await delay(delayMs)
          const body = (await request.json()) as
            VersionOnlyDocumentActionRequest | ReasonedDocumentActionRequest
          const outcome = applyDocumentAction({
            action,
            document: journey.documents[0]!,
            rowVersion: body.rowVersion,
            reason: 'reason' in body ? (body.reason ?? null) : null,
          })
          if (outcome.kind === 'conflict') {
            return HttpResponse.json(outcome.problem, { status: 409 })
          }
          if (outcome.kind === 'validation') {
            return HttpResponse.json(outcome.problem, { status: 422 })
          }
          journey.documents[0] = outcome.document
          journey.events.push(outcome.result.lifecycleEvent)
          return HttpResponse.json(outcome.result)
        },
      ),
    )
  }

  return journey
}

function timelineWithin() {
  const element = document.querySelector('[data-slot="document-timeline"]')
  if (element === null) {
    throw new Error('document timeline is not mounted')
  }
  return within(element as HTMLElement)
}

function confirmIn(dialog: HTMLElement, label: string) {
  const matches = within(dialog).getAllByRole('button', { name: label })
  expect(matches.length).toBeGreaterThan(0)
  return matches[0]!
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('composed canonical document lifecycle journey', () => {
  it('walks Submit → Post → Reverse on one Draft document with Arabic toasts, status badges, one timeline event per step, and a fresh idempotency key per action', async () => {
    const journey = useMutableJourney(120)
    const user = userEvent.setup()

    render(<DocumentDetailPage />, { wrapper: createJourneyWrapper() })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    await screen.findByText('إنشاء الوثيقة')
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(1)
    expect(timelineWithin().queryByText('إرسال للترحيل')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))

    expect(screen.getByRole('button', { name: 'جارٍ التنفيذ...' })).toBeInTheDocument()
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(1)

    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    await waitFor(() =>
      expect(screen.getAllByText('بانتظار الترحيل').length).toBeGreaterThanOrEqual(1),
    )
    await waitFor(() => expect(screen.getAllByText('الإصدار: 2').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('إرسال للترحيل')).toBeInTheDocument())
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(2)
    expect(timelineWithin().queryByText('ترحيل الوثيقة')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'ترحيل' }))

    await screen.findByText('تم ترحيل السند بنجاح')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Posted', rowVersion: 3 })
    await waitFor(() => expect(screen.getAllByText('مرحّل').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 3').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('ترحيل الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(3)
    expect(timelineWithin().queryByText('عكس الوثيقة')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'عكس' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'عكس' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(dialog).getByLabelText('سبب الإجراء'), 'خطأ في الترحيل')
    await user.click(confirmIn(dialog, 'عكس'))

    await screen.findByText('تم عكس السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 4 })
    await waitFor(() => expect(screen.getAllByText('معكوس').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 4').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('عكس الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(4)
    expect(timelineWithin().getByText('خطأ في الترحيل')).toBeInTheDocument()
    expect(timelineWithin().queryByText('رفض الوثيقة')).not.toBeInTheDocument()
    expect(timelineWithin().queryByText('بدء المراجعة')).not.toBeInTheDocument()
    expect(timelineWithin().queryByText('إلغاء الوثيقة')).not.toBeInTheDocument()
    expect(
      screen.getByText('عرض للقراءة فقط — المستند معكوس وهو غير قابل للتعديل'),
    ).toBeInTheDocument()

    expect(journey.actionCalls).toEqual({
      Submit: 1,
      Post: 1,
      Reject: 0,
      Revise: 0,
      Cancel: 0,
      Reverse: 1,
    })
    expect(journey.capturedKeys.Submit).toHaveLength(1)
    expect(journey.capturedKeys.Post).toHaveLength(1)
    expect(journey.capturedKeys.Reverse).toHaveLength(1)
    expect(journey.capturedKeys.Submit[0]).not.toBeNull()
    expect(journey.capturedKeys.Submit[0]).not.toBe(journey.capturedKeys.Post[0])
    expect(journey.capturedKeys.Post[0]).not.toBe(journey.capturedKeys.Reverse[0])
  })

  it('loops Reject → Revise: the read-only Rejected window flips back to an editable Draft with the full event chain', async () => {
    const journey = useMutableJourney(80)
    const user = userEvent.setup()

    render(<DocumentDetailPage />, { wrapper: createJourneyWrapper() })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    await screen.findByText('إنشاء الوثيقة')

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))
    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    await waitFor(() => expect(screen.getByRole('button', { name: 'رفض' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'رفض' }))
    const rejectDialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(rejectDialog).getByLabelText('سبب الإجراء'), 'سبب غير مطابق للمستند')
    await user.click(within(rejectDialog).getByRole('button', { name: 'رفض' }))

    await screen.findByText('تم رفض السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Rejected', rowVersion: 3 })
    await waitFor(() => expect(screen.getAllByText('مرفوض').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(timelineWithin().getByText('رفض الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getByText('سبب غير مطابق للمستند')).toBeInTheDocument()
    expect(
      screen.getByText('عرض للقراءة فقط — المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل'),
    ).toBeInTheDocument()
    expect(screen.queryByText(DROPZONE_LABEL_AR)).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'مراجعة' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'مراجعة' }))

    await screen.findByText('تمت مراجعة السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Draft', rowVersion: 4 })
    await waitFor(() => expect(screen.getAllByText('مسودة').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 4').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('بدء المراجعة')).toBeInTheDocument())
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(4)
    await waitFor(() => expect(screen.getAllByText(DROPZONE_LABEL_AR)).toHaveLength(2))
    expect(
      screen.queryByText('عرض للقراءة فقط — المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeEnabled()
    expect(journey.actionCalls).toEqual({
      Submit: 1,
      Post: 0,
      Reject: 1,
      Revise: 1,
      Cancel: 0,
      Reverse: 0,
    })
  })

  it('cancels a Draft with a reason into a terminal read-only state with no further actions', async () => {
    const journey = useMutableJourney(80)
    const user = userEvent.setup()

    render(<DocumentDetailPage />, { wrapper: createJourneyWrapper() })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    await screen.findByText('إنشاء الوثيقة')

    await user.click(screen.getByRole('button', { name: 'إلغاء' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(dialog).getByLabelText('سبب الإجراء'), 'إلغاء بسبب خطأ في البيانات')
    await user.click(confirmIn(dialog, 'إلغاء'))

    await screen.findByText('تم إلغاء السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 2 })
    await waitFor(() => expect(screen.getAllByText('ملغي').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 2').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('إلغاء الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getByText('إلغاء بسبب خطأ في البيانات')).toBeInTheDocument()
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('عرض للقراءة فقط — المستند ملغى ولا يمكن تعديله')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'عكس' })).toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'مراجعة' })).not.toBeInTheDocument()
    expect(journey.actionCalls).toEqual({
      Submit: 0,
      Post: 0,
      Reject: 0,
      Revise: 0,
      Cancel: 1,
      Reverse: 0,
    })
  })

  it('cancels a Submitted document: the Cancel button enables after Submit, the reason dialog works, and the terminal Cancelled chain shows Created → Submitted → Cancelled', async () => {
    const journey = useMutableJourney(80)
    const user = userEvent.setup()

    render(<DocumentDetailPage />, { wrapper: createJourneyWrapper() })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    await screen.findByText('إنشاء الوثيقة')

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))
    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    await waitFor(() => expect(screen.getByRole('button', { name: 'إلغاء' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'إلغاء' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(dialog).getByLabelText('سبب الإجراء'), 'إلغاء بسبب خطأ في البيانات')
    await user.click(confirmIn(dialog, 'إلغاء'))

    await screen.findByText('تم إلغاء السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 3 })
    await waitFor(() => expect(screen.getAllByText('ملغي').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 3').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('إرسال للترحيل')).toBeInTheDocument())
    await waitFor(() => expect(timelineWithin().getByText('إلغاء الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getByText('إلغاء بسبب خطأ في البيانات')).toBeInTheDocument()
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('عرض للقراءة فقط — المستند ملغى ولا يمكن تعديله')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'عكس' })).toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'مراجعة' })).not.toBeInTheDocument()
    expect(journey.actionCalls).toEqual({
      Submit: 1,
      Post: 0,
      Reject: 0,
      Revise: 0,
      Cancel: 1,
      Reverse: 0,
    })
  })

  it('cancels a Rejected document: Cancel enables in the read-only Rejected window and the chain shows Created → Submitted → Rejected → Cancelled', async () => {
    const journey = useMutableJourney(80)
    const user = userEvent.setup()

    render(<DocumentDetailPage />, { wrapper: createJourneyWrapper() })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    await screen.findByText('إنشاء الوثيقة')

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))
    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    await waitFor(() => expect(screen.getByRole('button', { name: 'رفض' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'رفض' }))
    const rejectDialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(rejectDialog).getByLabelText('سبب الإجراء'), 'سبب غير مطابق للمستند')
    await user.click(within(rejectDialog).getByRole('button', { name: 'رفض' }))

    await screen.findByText('تم رفض السند')
    await waitFor(() => expect(screen.getByRole('button', { name: 'إلغاء' })).toBeEnabled())
    expect(
      screen.getByText('عرض للقراءة فقط — المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إلغاء' }))
    const cancelDialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(
      within(cancelDialog).getByLabelText('سبب الإجراء'),
      'إلغاء بسبب خطأ في البيانات',
    )
    await user.click(confirmIn(cancelDialog, 'إلغاء'))

    await screen.findByText('تم إلغاء السند')
    expect(journey.documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 4 })
    await waitFor(() => expect(screen.getAllByText('ملغي').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 4').length).toBeGreaterThan(0))
    await waitFor(() => expect(timelineWithin().getByText('رفض الوثيقة')).toBeInTheDocument())
    await waitFor(() => expect(timelineWithin().getByText('إلغاء الوثيقة')).toBeInTheDocument())
    expect(timelineWithin().getByText('إلغاء بسبب خطأ في البيانات')).toBeInTheDocument()
    expect(timelineWithin().getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('عرض للقراءة فقط — المستند ملغى ولا يمكن تعديله')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'عكس' })).toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'مراجعة' })).not.toBeInTheDocument()
    expect(journey.actionCalls).toEqual({
      Submit: 1,
      Post: 0,
      Reject: 1,
      Revise: 0,
      Cancel: 1,
      Reverse: 0,
    })
  })

  it('hides an action the session permission set denies even when the server policy enables it, and never fires a request for it', async () => {
    const journey = useMutableJourney()
    journey.documents[0] = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Posted',
      rowVersion: 2,
    })

    render(<DocumentDetailPage />, {
      wrapper: createJourneyWrapper([
        'document.view',
        'document.submit',
        'document.post',
        'document.reject',
        'document.revise',
        'document.cancel',
      ]),
    })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })

    expect(screen.queryByRole('button', { name: 'عكس' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
    expect(journey.actionCalls.Reverse).toBe(0)
    expect(journey.capturedKeys.Reverse).toHaveLength(0)
  })
})
