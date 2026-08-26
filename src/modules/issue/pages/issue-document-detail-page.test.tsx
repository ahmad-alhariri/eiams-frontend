import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import {
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentHistoryHandler,
  createWarehouseDocumentPolicyHandler,
} from '@/test/msw/warehouse-document-handlers'
import {
  createDocumentPolicy,
  createWarehouseDocument,
  deriveLifecycleEvents,
} from '@/test/msw/factories'
import { createQueryClient } from '@/shared/services/query.client'
import { server } from '@/test/msw/server'

import IssueDocumentDetailPage from './issue-document-detail-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'

function renderPage() {
  const client = createQueryClient()
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`/documents/issue/${DOCUMENT_ID}`]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/documents/issue/:documentId" element={children} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }
  return render(<IssueDocumentDetailPage />, { wrapper: Wrapper })
}

describe('IssueDocumentDetailPage', () => {
  it('renders the read-only IssueTo petal from the shared detail shell', async () => {
    const issueDocument = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Issue',
      documentStatus: 'Draft',
      issueTo: {
        recipientType: 'OrganizationalUnit',
        recipientId: '22222222-2222-4222-8222-222222222222',
        recipientDisplayName: 'مديرية المعلوماتية',
        issueReason: 'تجهيز مديرية المعلوماتية',
      },
      policy: createDocumentPolicy({ documentId: DOCUMENT_ID }),
    })
    server.use(
      ...createWarehouseDocumentDetailHandler(issueDocument),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(issueDocument)),
      ...createWarehouseDocumentPolicyHandler(issueDocument.policy),
    )

    renderPage()

    await waitFor(() => expect(screen.getByText('مديرية المعلوماتية')).toBeInTheDocument())
    // Petal rows: type label + display name + reason.
    expect(screen.getByText('وحدة تنظيمية')).toBeInTheDocument()
    expect(screen.getByText('تجهيز مديرية المعلوماتية')).toBeInTheDocument()
  })
})
