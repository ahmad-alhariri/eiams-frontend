import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse, WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import {
  createDocumentPolicy,
  createWarehouseDocument,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createWarehouseDocumentActionHandler } from '@/test/msw/warehouse-document-handlers'
import { Toaster } from '@/shared/ui/toaster'

import ReceivingDocumentDetailPage from './receiving-document-detail-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(200)
const DETAIL_PATH = ROUTE_PATHS.documentReceivingDetail.replace(':documentId', DOCUMENT_ID)
const SIGNED_ORIGINAL_ALERT = 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.'

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

/** WH_KEEPER-style session: can create/submit/cancel but never post or reject. */
const KEEPER_DOCUMENT_CODES = [
  'document.view',
  'document.create',
  'document.submit',
  'document.cancel',
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

function createWrapper(permissionCodes: readonly string[] = ALL_DOCUMENT_CODES) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <Toaster />
        <MemoryRouter initialEntries={[DETAIL_PATH]}>
          <Routes>
            <Route
              path={ROUTE_PATHS.documentReceivingDetail}
              element={<ReceivingDocumentDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

/**
 * Serves the mutable store record for detail/policy/history so every refetch
 * after a lifecycle action reflects the transitioned document. The policy is
 * re-evaluated per current status with `signedOriginalSatisfied` pinned to
 * `false` for every status — the client gate must be the only thing keeping
 * the alert off a posted document (eiams-frontend-46f2).
 */
function useMutableDocumentHandlers(store: WarehouseDocument[]) {
  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
      HttpResponse.json(store[0]),
    ),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
      const document = store[0]!
      return HttpResponse.json({
        documentId: DOCUMENT_ID,
        currentStatus: document.documentStatus,
        currentRowVersion: document.rowVersion,
        events: deriveLifecycleEvents(document),
      })
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
      const document = store[0]!
      return HttpResponse.json(
        createDocumentPolicy({
          documentId: DOCUMENT_ID,
          documentStatus: document.documentStatus,
          rowVersion: document.rowVersion,
          signedOriginalSatisfied: false,
        }),
      )
    }),
    ...createWarehouseDocumentActionHandler({
      initialDocument: store[0]!,
      documentStore: () => store,
    }),
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('receiving lifecycle and policy gates (e13-t07)', () => {
  it('hides Post and Reject from a keeper session on the receiving route', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      rowVersion: 2,
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: 'Submitted',
          currentRowVersion: 2,
          events: deriveLifecycleEvents(document),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(
          createDocumentPolicy({
            documentId: DOCUMENT_ID,
            documentStatus: 'Submitted',
            rowVersion: 2,
            signedOriginalSatisfied: false,
          }),
        ),
      ),
    )

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper(KEEPER_DOCUMENT_CODES) })

    await screen.findByText('بانتظار الترحيل')
    expect(screen.queryByRole('button', { name: 'ترحيل' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument()
    expect(screen.getByText(SIGNED_ORIGINAL_ALERT)).toBeInTheDocument()
  })

  it('shows Post and Reject to a manager session on the same submitted document', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      rowVersion: 2,
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: 'Submitted',
          currentRowVersion: 2,
          events: deriveLifecycleEvents(document),
        }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(
          createDocumentPolicy({
            documentId: DOCUMENT_ID,
            documentStatus: 'Submitted',
            rowVersion: 2,
            signedOriginalSatisfied: false,
          }),
        ),
      ),
    )

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper(ALL_DOCUMENT_CODES) })

    await waitFor(() => expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'رفض' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
  })

  it('walks Draft → Submit → Post → Reverse with policy-driven states and no stale signed-original alert', async () => {
    const store: WarehouseDocument[] = [createWarehouseDocument({ documentId: DOCUMENT_ID })]
    useMutableDocumentHandlers(store)
    const user = userEvent.setup()

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper(ALL_DOCUMENT_CODES) })

    await screen.findByRole('button', { name: 'إرسال للترحيل' })
    expect(screen.getByText(SIGNED_ORIGINAL_ALERT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))
    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    await waitFor(() => expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled())
    expect(store[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(screen.getByText(SIGNED_ORIGINAL_ALERT)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ترحيل' }))
    await screen.findByText('تم ترحيل السند بنجاح')
    await waitFor(() => expect(screen.getAllByText('مرحّل').length).toBeGreaterThanOrEqual(1))
    expect(store[0]).toMatchObject({ documentStatus: 'Posted', rowVersion: 3 })
    expect(screen.queryByText(SIGNED_ORIGINAL_ALERT)).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'عكس' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'عكس' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(dialog).getByLabelText('سبب الإجراء'), 'خطأ في الترحيل')
    await user.click(within(dialog).getAllByRole('button', { name: 'عكس' })[0]!)
    await screen.findByText('تم عكس السند')
    await waitFor(() => expect(screen.getAllByText('معكوس').length).toBeGreaterThanOrEqual(1))
    expect(store[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 4 })
  })

  it('loops Reject → Revise on the receiving route: the read-only Rejected window flips back to an editable Draft', async () => {
    const store: WarehouseDocument[] = [
      createWarehouseDocument({ documentId: DOCUMENT_ID, documentStatus: 'Draft' }),
    ]
    useMutableDocumentHandlers(store)
    const user = userEvent.setup()

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper(ALL_DOCUMENT_CODES) })

    await screen.findByRole('button', { name: 'إرسال للترحيل' })

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))
    await screen.findByText('تم إرسال السند للترحيل بنجاح')
    await waitFor(() => expect(screen.getByRole('button', { name: 'رفض' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'رفض' }))
    const rejectDialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(within(rejectDialog).getByLabelText('سبب الإجراء'), 'بيانات ناقصة في السند')
    await user.click(within(rejectDialog).getByRole('button', { name: 'رفض' }))

    await screen.findByText('تم رفض السند')
    expect(store[0]).toMatchObject({ documentStatus: 'Rejected', rowVersion: 3 })
    await waitFor(() => expect(screen.getAllByText('مرفوض').length).toBeGreaterThanOrEqual(1))
    expect(
      screen.getByText('عرض للقراءة فقط — المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل'),
    ).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'مراجعة' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'مراجعة' }))

    await screen.findByText('تمت مراجعة السند')
    expect(store[0]).toMatchObject({ documentStatus: 'Draft', rowVersion: 4 })
    await waitFor(() => expect(screen.getAllByText('مسودة').length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(screen.getAllByText('الإصدار: 4').length).toBeGreaterThan(0))
    expect(
      screen.queryByText('عرض للقراءة فقط — المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeEnabled()
    expect(screen.getByText(SIGNED_ORIGINAL_ALERT)).toBeInTheDocument()
  })
})
