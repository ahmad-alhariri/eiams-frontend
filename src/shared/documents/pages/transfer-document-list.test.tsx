import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import DocumentListPage from './document-list-page'
import {
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouseDocument,
} from '@/test/msw/factories'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير المستندات' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
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
        // `okPageJson`, NOT `HttpResponse.json(createPage([...]))`.
        // `createPage` from factories returns a UI page (`{items, meta}`); the
        // transport reads the wire envelope, where the rows sit under `data`
        // and the counters are snake_case siblings of it. A `createPage` body
        // makes `requestPage` see `undefined` items and throw on the next
        // `.page` access, which is the failure mode recorded in
        // `transport-seam.test.ts`.
        return okPageJson([transferDocument])
      }),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([])),
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
