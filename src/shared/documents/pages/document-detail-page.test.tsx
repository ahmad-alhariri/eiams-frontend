import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type {
  SessionResponse,
  VersionOnlyDocumentActionRequest,
} from '@/shared/types/generated/eiams-v1'
import {
  createDocumentPolicy,
  createMaterial,
  createPolicyBlocker,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import {
  applyDocumentAction,
  createWarehouseDocumentActionHandler,
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentHistoryHandler,
  createWarehouseDocumentPolicyHandler,
} from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import DocumentDetailPage from './document-detail-page'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000002bc'

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

function createWrapper(
  initialPath: string,
  permissionCodes: readonly string[] = ALL_DOCUMENT_CODES,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/documents/receiving/:documentId" element={<DocumentDetailPage />} />
            <Route path="/documents/issue/:documentId" element={<DocumentDetailPage />} />
            <Route path="/documents/transfer/:documentId" element={<DocumentDetailPage />} />
            <Route path="/documents/opening/:documentId" element={<DocumentDetailPage />} />
            <Route path="/documents/return/:documentId" element={<DocumentDetailPage />} />
            <Route path="/documents/:unknownKind/:documentId" element={<DocumentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('DocumentDetailPage', () => {
  it('renders the server detail of a Posted Receiving document with read-only sections and policy actions', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Receiving',
      documentStatus: 'Posted',
      rowVersion: 2,
      systemReferenceNumber: 'EIAMS-DOC-2026-0300',
      paperDocumentNumber: '2026/0300',
      paperDocumentYear: 2026,
      postedAt: '2026-01-02T00:00:00.000Z',
      postedBy: { id: '00000000-0000-4000-8000-00000000000a', displayName: 'مدير المستودع' },
      warehouse: { id: '00000000-0000-4000-8000-00000000001e', displayName: 'المستودع المركزي' },
      lines: [
        createWarehouseDocumentLine({
          lineId: '00000000-0000-4000-8000-0000000000c9',
          material: { ...createMaterial(), nameAr: 'حبر طابعة', code: 'IT-CON-INK' },
          quantity: 40,
          unit: { id: '00000000-0000-4000-8000-000000000017', displayName: 'عبوة' },
        }),
      ],
      attachments: [
        {
          attachmentId: '00000000-0000-4000-8000-0000000000ca',
          attachmentType: 'SignedOriginal',
          checksum: 'sha256:fixture',
          documentId: DOCUMENT_ID,
          downloadUrl: null,
          fileSize: 2048,
          mimeType: 'application/pdf',
          originalFilename: 'signed-receiving.pdf',
          uploadedAt: '2026-01-01T00:00:00.000Z',
          uploadedBy: { id: '00000000-0000-4000-8000-00000000000a', displayName: 'مستخدم تجريبي' },
        },
      ],
      policy: {
        ...createSubmittedPostedPolicy('Posted'),
        signedOriginalSatisfied: true,
      },
    })

    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: /EIAMS-DOC-2026-0300/,
    })
    expect(heading).toHaveTextContent('تفاصيل سند الاستلام')
    expect(heading).toHaveTextContent('EIAMS-DOC-2026-0300')

    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    expect(screen.getAllByText('إيصال استلام').length).toBeGreaterThan(0)
    expect(screen.getAllByText('الإصدار: 2').length).toBeGreaterThan(0)
    expect(screen.getByText('مدير المستودع')).toBeInTheDocument()
    expect(screen.getAllByText(/يناير ٢٠٢٦/).length).toBeGreaterThan(0)

    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getByText('2026/0300')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()

    expect(screen.getByText('حبر طابعة')).toBeInTheDocument()
    expect(screen.getByText('٤٠')).toBeInTheDocument()
    expect(screen.getByText('عبوة')).toBeInTheDocument()

    expect(screen.getByText('signed-receiving.pdf')).toBeInTheDocument()
    expect(screen.getByText('النسخة الأصلية الموقعة مرفوعة')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'العودة إلى سندات الاستلام' })).toHaveAttribute(
      'href',
      '/documents/receiving',
    )
  })

  it('shows per-status lifecycle actions, blockers as Arabic alerts, and a read-only attachments panel', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      attachments: [
        {
          attachmentId: '00000000-0000-4000-8000-0000000000cb',
          attachmentType: 'SignedOriginal',
          checksum: 'sha256:fixture',
          documentId: DOCUMENT_ID,
          downloadUrl: null,
          fileSize: 2048,
          mimeType: 'application/pdf',
          originalFilename: 'signed-submitted.pdf',
          uploadedAt: '2026-01-01T00:00:00.000Z',
          uploadedBy: { id: '00000000-0000-4000-8000-00000000000a', displayName: 'مستخدم تجريبي' },
        },
      ],
      policy: {
        ...createSubmittedPostedPolicy('Submitted'),
        signedOriginalSatisfied: false,
      },
    })

    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    const heading = await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })
    expect(heading).toHaveTextContent('تفاصيل سند الاستلام')
    expect(screen.getByText('بانتظار الترحيل')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'رفض' })).toBeEnabled()

    // Wait for the wired timeline to resolve so its transient status/spinner
    // never races the role-based queries below.
    expect(await screen.findByText('إنشاء الوثيقة')).toBeInTheDocument()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
    )

    expect(screen.getByRole('status')).toHaveTextContent('النسخة الأصلية الموقعة مطلوبة للترحيل')
    expect(screen.queryByRole('button', { name: /حذف المرفق/ })).not.toBeInTheDocument()
    expect(screen.getByText('signed-submitted.pdf')).toBeInTheDocument()
  })

  it('shows a loading state while the server responds', async () => {
    const document = createWarehouseDocument({ documentId: DOCUMENT_ID })

    server.use(
      ...createWarehouseDocumentDetailHandler(document, { delayMs: 400 }),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy, { delayMs: 400 }),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    expect(await screen.findByText('جارٍ تحميل تفاصيل السند...')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ }),
    ).toBeInTheDocument()
  })

  it('renders the Arabic error card and retries the failed detail request', async () => {
    const document = createWarehouseDocument({ documentId: DOCUMENT_ID })
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(document)
      }),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل السند' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(
      await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ }),
    ).toBeInTheDocument()
  })

  it('renders nothing for an unknown document route', () => {
    server.use(
      ...createWarehouseDocumentDetailHandler(createWarehouseDocument({ documentId: DOCUMENT_ID })),
    )

    const { container } = render(<DocumentDetailPage />, {
      wrapper: createWrapper('/documents/unknown-kind/123'),
    })

    expect(container).toBeEmptyDOMElement()
    expect(document.querySelector('[data-slot="document-detail-page"]')).toBeNull()
  })

  it('hides lifecycle actions the session permission set does not allow', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      policy: {
        ...createSubmittedPostedPolicy('Submitted'),
        signedOriginalSatisfied: false,
      },
    })

    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`, ['document.view']),
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'ترحيل' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إرسال للترحيل' })).not.toBeInTheDocument()
  })

  it('renders the page shell in RTL direction', async () => {
    const doc = createWarehouseDocument({ documentId: DOCUMENT_ID })

    server.use(
      ...createWarehouseDocumentDetailHandler(doc),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(doc)),
      ...createWarehouseDocumentPolicyHandler(doc.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })

    expect(document.querySelector('[data-slot="document-detail-page"]')).toHaveAttribute(
      'dir',
      'rtl',
    )
  })

  it('executes the real submit mutation from the lifecycle bar with busy state and a refreshed document', async () => {
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Draft',
          rowVersion: 1,
        }),
      ],
    }
    let detailRequests = 0
    let submitCalls = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.documents[0])
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: store.documents[0]?.documentStatus ?? 'Draft',
          currentRowVersion: store.documents[0]?.rowVersion ?? 0,
          events: deriveLifecycleEvents(store.documents[0] ?? createWarehouseDocument()),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(store.documents[0]?.policy),
      ),
      ...createWarehouseDocumentActionHandler({
        initialDocument: store.documents[0]!,
        documentStore: () => store.documents,
        delayMs: 100,
        onDocumentUpdated: (_document, action) => {
          if (action === 'Submit') {
            submitCalls += 1
          }
        },
      }),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    await screen.findByRole('button', { name: 'إرسال للترحيل' })
    const before = detailRequests

    fireEvent.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'جارٍ التنفيذ...' })).toBeInTheDocument(),
    )

    // The detail badge and the timeline's current-status badge both update.
    await waitFor(() =>
      expect(screen.getAllByText('بانتظار الترحيل').length).toBeGreaterThanOrEqual(1),
    )
    expect(submitCalls).toBe(1)
    expect(store.documents[0]?.documentStatus).toBe('Submitted')
    expect(store.documents[0]?.rowVersion).toBe(2)

    // The success cache write + detail invalidation refetched the document.
    await waitFor(() => expect(detailRequests).toBeGreaterThan(before))
  })

  it('renders upload controls in the attachments panel for a Draft document', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      rowVersion: 1,
    })

    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })

    // Signed-original + supporting dropzones are present (not read-only).
    expect(screen.getAllByText('اسحب وأفلت الملف هنا أو انقر للاختيار')).toHaveLength(2)
  })

  it('renders the Arabic balance preflight blocker above the action bar for an over-balance Submitted Issue', async () => {
    let detailRequests = 0
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Issue',
      documentStatus: 'Submitted',
      lines: [
        createWarehouseDocumentLine({
          availableBalance: 12,
          lineId: fixtureUuid(241),
          material: { code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' },
          quantity: 25,
          unit: { id: fixtureUuid(242), displayName: 'رزمة' },
        }),
      ],
      paperDocumentNumber: '2026/0451',
      paperDocumentYear: 2026,
      policy: {
        ...createSubmittedPostedPolicy('Submitted'),
        blockers: [],
        signedOriginalSatisfied: true,
      },
      warehouse: { id: fixtureUuid(243), displayName: 'مستودع الفرع — حلب' },
    })

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(document)
      }),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/issue/${DOCUMENT_ID}`),
    })

    await screen.findByRole('heading', { level: 1, name: /EIAMS-DOC-2024-0001/ })

    // The balance blocker renders above the action bar as the single alert.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'الكمية المطلوبة (٢٥) تتجاوز الرصيد المتاح (١٢) للمادة «ورق تصوير A4».',
    )
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled()

    // The page and the coordinator observe the same cache keys: the detail
    // request fires exactly once despite two query observers.
    expect(detailRequests).toBe(1)
  })

  it('recovers from a 409 conflict: reloads the fresh version and retries with the same idempotency key', async () => {
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Draft',
          rowVersion: 1,
        }),
      ],
    }
    let detailRequests = 0
    let submitCalls = 0
    const capturedIdempotencyKeys: (string | null)[] = []

    server.use(
      // Custom submit route so the test can assert the Idempotency-Key header
      // across both attempts; it replays the same transition engine the
      // factory action handler uses (rowVersion guard → 409).
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`,
        async ({ request }) => {
          capturedIdempotencyKeys.push(request.headers.get('Idempotency-Key'))
          const body = (await request.json()) as VersionOnlyDocumentActionRequest
          const outcome = applyDocumentAction({
            action: 'Submit',
            document: store.documents[0]!,
            rowVersion: body.rowVersion,
          })
          if (outcome.kind === 'conflict') {
            return HttpResponse.json(outcome.problem, { status: 409 })
          }
          if (outcome.kind === 'validation') {
            return HttpResponse.json(outcome.problem, { status: 422 })
          }
          submitCalls += 1
          store.documents[0] = outcome.document
          return HttpResponse.json(outcome.result)
        },
      ),
      ...createWarehouseDocumentActionHandler({
        initialDocument: store.documents[0]!,
        documentStore: () => store.documents,
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.documents[0])
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: store.documents[0]?.documentStatus ?? 'Draft',
          currentRowVersion: store.documents[0]?.rowVersion ?? 0,
          events: deriveLifecycleEvents(store.documents[0] ?? createWarehouseDocument()),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(store.documents[0]?.policy),
      ),
    )

    render(<DocumentDetailPage />, {
      wrapper: createWrapper(`/documents/receiving/${DOCUMENT_ID}`),
    })

    await screen.findByRole('button', { name: 'إرسال للترحيل' })

    // Another actor edits the document while this session holds rowVersion 1.
    store.documents[0] = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      rowVersion: 2,
    })

    fireEvent.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))

    // The stale-rowVersion submit 409s and the conflict dialog appears.
    const dialog = await screen.findByRole('alertdialog', { name: 'تعديل متزامن على السند' })
    expect(dialog).toBeInTheDocument()
    expect(submitCalls).toBe(0)
    expect(capturedIdempotencyKeys).toHaveLength(1)
    const detailRequestsAfterConflict = detailRequests

    fireEvent.click(screen.getByRole('button', { name: 'تحميل النسخة الأحدث' }))

    // Recovery refetches detail (+ policy) and closes the dialog once fresh.
    await waitFor(() => expect(detailRequests).toBeGreaterThan(detailRequestsAfterConflict))
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'تعديل متزامن على السند' }),
      ).not.toBeInTheDocument(),
    )

    // Retry now submits the FRESH rowVersion with the SAME idempotency key.
    fireEvent.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))

    await waitFor(() => expect(submitCalls).toBe(1))
    expect(store.documents[0]?.documentStatus).toBe('Submitted')
    expect(store.documents[0]?.rowVersion).toBe(3)
    expect(capturedIdempotencyKeys).toHaveLength(2)
    expect(capturedIdempotencyKeys[0]).not.toBeNull()
    expect(capturedIdempotencyKeys[1]).toBe(capturedIdempotencyKeys[0])

    // The success cache write + detail invalidation refreshed the page.
    await waitFor(() =>
      expect(screen.getAllByText('بانتظار الترحيل').length).toBeGreaterThanOrEqual(1),
    )
  })
})

/** Status-appropriate policy derived from the contract factory. */
function createSubmittedPostedPolicy(status: 'Submitted' | 'Posted') {
  return createDocumentPolicy({
    documentId: DOCUMENT_ID,
    documentStatus: status,
    blockers: status === 'Submitted' ? [createPolicyBlocker()] : [],
  })
}
