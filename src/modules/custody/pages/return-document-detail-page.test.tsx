import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { environment } from '@/config/env'
import {
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentHistoryHandler,
  createWarehouseDocumentPolicyHandler,
  toWireDetails,
} from '@/test/msw/warehouse-document-handlers'
import { errJson, okJson } from '@/test/msw/envelope'
import {
  createDocumentPolicy,
  createWarehouseDocument,
  deriveLifecycleEvents,
} from '@/test/msw/factories'
import { createQueryClient } from '@/shared/services/query.client'
import { server } from '@/test/msw/server'

import ReturnDocumentDetailPage from './return-document-detail-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function renderPage() {
  const client = createQueryClient()
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`/documents/return/${DOCUMENT_ID}`]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/documents/return/:documentId" element={children} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }
  return render(<ReturnDocumentDetailPage />, { wrapper: Wrapper })
}

describe('ReturnDocumentDetailPage (e19-t07)', () => {
  const ISSUE_DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'

  it('renders the read-only ReturnInfo petal from the shared detail shell', async () => {
    const returnDocument = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Return',
      documentStatus: 'Draft',
      returnInfo: {
        assetIds: ['77777777-7777-4777-8777-777777777777'],
        originalIssueDocumentId: ISSUE_DOCUMENT_ID,
        originalIssueReference: 'ISSUE-2026-0001',
        returnReason: 'عودة المواد بعد انتهاء الحاجة',
      },
      policy: createDocumentPolicy({ documentId: DOCUMENT_ID }),
    })
    // The detail projection carries the original issue only as its id, so the
    // page resolves the human-readable reference from the issue's own detail
    // read (one extra GET, same shared query hooks — no wire change).
    const issueDocument = createWarehouseDocument({
      documentId: ISSUE_DOCUMENT_ID,
      documentType: 'Issue',
      documentStatus: 'Posted',
      systemReferenceNumber: 'DMS-ISS-2026-000032',
      paperDocumentNumber: 'E2E-ISS-182557',
      paperDocumentYear: 2026,
    })
    server.use(
      // ONE combined detail handler (id → document): a second same-pattern
      // handler does not fall through on an id mismatch, so two registered
      // detail handlers would 404 each other's documents.
      http.get(`${environment.apiBaseUrl}/warehouse-documents/:documentId`, async ({ params }) => {
        const documentId = String(params['documentId'])
        if (documentId === ISSUE_DOCUMENT_ID) {
          return okJson(toWireDetails(issueDocument))
        }
        if (documentId === DOCUMENT_ID) {
          return okJson(toWireDetails(returnDocument))
        }
        // The MSW envelope discipline forbids a bare `HttpResponse.json` body,
        // so the not-found path returns the wire error envelope `errJson` ships.
        return errJson(404, {
          code: 'WAREHOUSE_DOCUMENT_NOT_FOUND',
          message: 'The requested warehouse document does not exist.',
        })
      }),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(returnDocument)),
      ...createWarehouseDocumentPolicyHandler(returnDocument),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('عودة المواد بعد انتهاء الحاجة')).toBeInTheDocument(),
    )
    // The live `ReturnInfoResponse` carries the original issue id and the
    // reason. `originalIssueReference` and `assetIds` are NOT on the projection:
    // the returned assets live on the document's own `lines[].selectedAssets`,
    // which the shared lines card renders.
    expect(screen.getByText('سند الصرف الأصلي')).toBeInTheDocument()
    expect(screen.getByText('سبب الإرجاع')).toBeInTheDocument()
    expect(screen.queryByText('ISSUE-2026-0001')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'DMS-ISS-2026-000032 (E2E-ISS-182557/2026)' }),
    ).toHaveAttribute('href', `/documents/issue/${ISSUE_DOCUMENT_ID}`)
    expect(screen.queryByRole('link', { name: '77777777-7777-4777-8777-777777777777' })).toBeNull()
  })

  it('keeps the raw issue id as the link label when its own detail read is unavailable', async () => {
    const returnDocument = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Return',
      documentStatus: 'Draft',
      returnInfo: {
        assetIds: [],
        originalIssueDocumentId: ISSUE_DOCUMENT_ID,
        originalIssueReference: 'ISSUE-2026-0001',
        returnReason: 'عودة المواد بعد انتهاء الحاجة',
      },
      policy: createDocumentPolicy({ documentId: DOCUMENT_ID }),
    })
    server.use(
      // Serves the RETURN document only — the ISSUE id falls to the 404, so the
      // issue read fails and the page degrades to the only reference it truly
      // has: the id itself.
      ...createWarehouseDocumentDetailHandler(returnDocument),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(returnDocument)),
      ...createWarehouseDocumentPolicyHandler(returnDocument),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('عودة المواد بعد انتهاء الحاجة')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('link', { name: ISSUE_DOCUMENT_ID }),
    ).toHaveAttribute('href', `/documents/issue/${ISSUE_DOCUMENT_ID}`)
  })
})
