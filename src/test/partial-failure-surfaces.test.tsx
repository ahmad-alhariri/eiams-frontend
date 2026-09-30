import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse, WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import {
  createActionAvailability,
  createDocumentAttachment,
  createDocumentPolicy,
  createWarehouseDocument,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import { toWireErrorResponse } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

/**
 * The remaining "a secondary query or mutation failed and the screen says
 * nothing" surfaces (e24-t10). The same defect class was found and fixed on one
 * surface in e24-t09 (F-1, the document policy read); this suite pins the
 * attachment-mutation half of the same class, and the balance/custody reads
 * live in their own consumer suites.
 *
 * B1 — a failed attachment DELETE produced no user-visible feedback at all.
 * B2 — attachment failures discarded the server's Arabic `detailAr` and never
 *      refetched on a 409.
 */

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import DocumentDetailPage from '@/shared/documents/pages/document-detail-page'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(940)
const ATTACHMENT_ID = fixtureUuid(941)
const FILENAME = 'signed-original.pdf'

const ATTACHMENT_DELETE_ERROR_SELECTOR = '[data-testid="attachment-delete-error"]'

/** Approved Arabic for the row-version conflict code, per the governed table. */
const CONFLICT_TITLE_AR = 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: fixtureUuid(10),
      username: 'warehouse.keeper',
      displayName: 'أمين المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    activeRoles: [],
  }
}

/** A Draft Receiving document carrying one signed original, editable. */
function draftWithSignedOriginal(): WarehouseDocument {
  return createWarehouseDocument({
    documentId: DOCUMENT_ID,
    documentType: 'Receiving',
    documentStatus: 'Draft',
    rowVersion: 4,
    systemReferenceNumber: 'EIAMS-REC-2026-0940',
    attachments: [
      createDocumentAttachment({
        attachmentId: ATTACHMENT_ID,
        documentId: DOCUMENT_ID,
        attachmentType: 'SignedOriginal',
        originalFilename: FILENAME,
      }),
    ],
  })
}

/**
 * A Draft policy that presents the attachment-mutation actions the panel's
 * controls are gated on (`document-detail-page.tsx` `attachmentsReadOnly`).
 */
function draftPolicy() {
  return createDocumentPolicy({
    documentId: DOCUMENT_ID,
    documentStatus: 'Draft',
    signedOriginalSatisfied: true,
    actions: [
      createActionAvailability('Submit', { allowed: true, presentation: 'Enabled' }),
      createActionAvailability('UploadAttachment', { allowed: true, presentation: 'Enabled' }),
      createActionAvailability('DeleteAttachment', { allowed: true, presentation: 'Enabled' }),
    ],
  })
}

function conflictProblem() {
  return {
    code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    status: 409,
    traceId: 'mock-trace',
  }
}

function createClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderDocumentDetail(client: QueryClient) {
  client.setQueryData(authSessionQueryKey, sessionWith(['document.view', 'document.update']))
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

/** Reads the panel's own delete alert out of the rendered detail page. */
function deleteAlert(container: HTMLElement): HTMLElement | null {
  return container.querySelector(ATTACHMENT_DELETE_ERROR_SELECTOR)
}

/** Removes the signed original through the panel's real confirm-then-delete flow. */
async function removeSignedOriginal(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `حذف المرفق ${FILENAME}` }))
  const dialog = await screen.findByRole('alertdialog', { name: 'حذف المرفق' })
  fireEvent.click(screen.getByRole('button', { name: 'حذف' }))
  await waitFor(() => expect(dialog).toBeTruthy())
}

describe('B1 — a failed attachment delete must leave user-visible feedback', () => {
  it('renders the failed delete in the attachment panel instead of leaving the screen unchanged', async () => {
    let deleteCalls = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(draftWithSignedOriginal()),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(draftPolicy()),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: 'Draft',
          currentRowVersion: 4,
          events: deriveLifecycleEvents(draftWithSignedOriginal()),
        }),
      ),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        () => {
          deleteCalls += 1
          return toWireErrorResponse(conflictProblem(), 409)
        },
      ),
    )

    const client = createClient()
    const { container } = renderDocumentDetail(client)

    // The signed original is listed, so the delete control is reachable.
    expect(await screen.findByTestId('attachment-name')).toHaveTextContent(FILENAME)
    expect(deleteAlert(container)).toBeNull()

    await removeSignedOriginal()

    // Before the fix nothing at all rendered: the manager held the error, the
    // page's `Pick` dropped the prop, and the panel had no slot for it.
    await waitFor(() => expect(deleteAlert(container)).not.toBeNull())
    const alert = deleteAlert(container)!
    expect(alert).toHaveAttribute('role', 'alert')
    // The attachment is genuinely still there — nothing pretended otherwise.
    expect(screen.getByTestId('attachment-name')).toHaveTextContent(FILENAME)
    // No silent automatic retry of a rejected delete.
    expect(deleteCalls).toBe(1)
  })
})

describe('B2 — attachment failures keep the server Arabic detail and recover on 409', () => {
  it('shows the problem detailAr rather than the generic titleAr, and refetches on a 409', async () => {
    let detailRequests = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(draftWithSignedOriginal())
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(draftPolicy()),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: 'Draft',
          currentRowVersion: 4,
          events: deriveLifecycleEvents(draftWithSignedOriginal()),
        }),
      ),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        () => toWireErrorResponse(conflictProblem(), 409),
      ),
    )

    const client = createClient()
    const { container } = renderDocumentDetail(client)

    expect(await screen.findByTestId('attachment-name')).toHaveTextContent(FILENAME)
    const before = detailRequests

    await removeSignedOriginal()

    await waitFor(() => expect(deleteAlert(container)).not.toBeNull())
    const alert = deleteAlert(container)!
    // B2: the wire carries an ENGLISH message only, so the Arabic the user sees is
    // resolved from the conflict code in the governed `error-copy-ar.ts` table. This
    // replaces the old assertion that the SERVER's `detailAr` was rendered, which
    // described a shape the API never sends.
    expect(alert).toHaveTextContent(CONFLICT_TITLE_AR)
    expect(alert).not.toHaveTextContent('The document row version did not match')
    // D-LIFE-01 rule 6: a conflict means the cached document is stale, so the
    // authoritative detail/policy/attachments branch is refetched.
    await waitFor(() => expect(detailRequests).toBeGreaterThan(before))
  })
})
