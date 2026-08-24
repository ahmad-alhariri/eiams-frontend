import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import DocumentListPage from './document-list-page'
import { createPage, createWarehouseDocument } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

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
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function createTransferWrapper(permissionCodes: readonly string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/documents/transfer']}>
          <Routes>
            <Route path="/documents/transfer" element={<DocumentListPage />} />
            <Route
              path="/documents/transfer/new"
              element={<span role="status">نموذج تحويل جديد</span>}
            />
            <Route
              path="/documents/transfer/:documentId"
              element={<span role="status">تفاصيل السند</span>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('Transfer documents list (e17-t02)', () => {
  it('renders the transfer heading, sends documentType=Transfer to the server, and links rows', async () => {
    const transferDocument = createWarehouseDocument({
      documentId: 'b0e00000-0000-4000-8000-0000000000b1',
      documentType: 'Transfer',
    })
    const received = { documentType: null as string | null }

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        received.documentType = new URL(request.url).searchParams.get('documentType')
        return HttpResponse.json(createPage([transferDocument]))
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))),
    )

    render(<DocumentListPage />, {
      wrapper: createTransferWrapper(['document.view', 'document.create']),
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سندات التحويل' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(received.documentType).toBe('Transfer'))
  })
})
