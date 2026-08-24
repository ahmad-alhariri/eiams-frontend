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
  it('renders the read-only ReturnInfo petal from the shared detail shell', async () => {
    const returnDocument = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Return',
      documentStatus: 'Draft',
      returnInfo: {
        originalIssueDocumentId: '66666666-6666-4666-8666-666666666666',
        originalIssueReference: 'ISSUE-2026-0001',
        returnReason: 'عودة المواد بعد انتهاء الحاجة',
      },
      policy: createDocumentPolicy({ documentId: DOCUMENT_ID }),
    })
    server.use(
      ...createWarehouseDocumentDetailHandler(returnDocument),
      ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(returnDocument)),
      ...createWarehouseDocumentPolicyHandler(returnDocument.policy),
    )

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('عودة المواد بعد انتهاء الحاجة')).toBeInTheDocument(),
    )
    // Petal rows: original issue linkage + paper reference + reason.
    expect(screen.getByText('ISSUE-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('سند الصرف الأصلي')).toBeInTheDocument()
    expect(screen.getByText('سبب الإرجاع')).toBeInTheDocument()
  })
})
