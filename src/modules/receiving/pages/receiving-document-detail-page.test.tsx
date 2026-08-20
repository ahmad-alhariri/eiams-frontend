import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'
import { createWarehouseDocument, deriveLifecycleEvents, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentHistoryHandler,
  createWarehouseDocumentPolicyHandler,
} from '@/test/msw/warehouse-document-handlers'

import ReceivingDocumentDetailPage from './receiving-document-detail-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const DOCUMENT_ID = fixtureUuid(200)
const DETAIL_PATH = ROUTE_PATHS.documentReceivingDetail.replace(':documentId', DOCUMENT_ID)

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

function createWrapper(permissionCodes: readonly string[] = ALL_DOCUMENT_CODES) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
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

function useDocumentHandlers(document: ReturnType<typeof createWarehouseDocument>) {
  server.use(
    ...createWarehouseDocumentDetailHandler(document),
    ...createWarehouseDocumentHistoryHandler(deriveLifecycleEvents(document)),
    ...createWarehouseDocumentPolicyHandler(document.policy),
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('ReceivingDocumentDetailPage', () => {
  it('renders the receiving petal (type, supplier, invoice) from the server document', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Posted',
      receivingInfo: {
        receivingType: 'Supplier',
        supplierInvoiceRef: 'INV-2026/0841',
        supplierRef: 'الشركة العامة للتجهيز',
      },
    })
    useDocumentHandlers(document)

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('توريد من مورد')).toBeInTheDocument()
    expect(screen.getByText('الشركة العامة للتجهيز')).toBeInTheDocument()
    expect(screen.getByText('INV-2026/0841')).toBeInTheDocument()
  })

  it('falls back to the raw receivingType for values outside the PRD trio', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Posted',
      receivingInfo: {
        receivingType: 'Purchase',
        supplierRef: 'SUP-001',
        supplierInvoiceRef: null,
      },
    })
    useDocumentHandlers(document)

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('Purchase')).toBeInTheDocument()
    expect(screen.queryByText('رقم فاتورة المورد')).not.toBeInTheDocument()
  })

  it('renders no petal section when the server document carries no ReceivingInfo', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Posted',
      receivingInfo: undefined,
    })
    useDocumentHandlers(document)

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper() })

    await screen.findByText('بيانات المستند')
    expect(screen.queryByText('المورد')).not.toBeInTheDocument()
    expect(screen.queryByText('نوع الاستلام')).not.toBeInTheDocument()
  })

  it('keeps the manager review action bar on the receiving route', async () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      receivingInfo: {
        receivingType: 'Supplier',
        supplierRef: 'الشركة العامة للتجهيز',
        supplierInvoiceRef: null,
      },
    })
    useDocumentHandlers(document)

    render(<ReceivingDocumentDetailPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('button', { name: 'ترحيل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'رفض' })).toBeInTheDocument()
    expect(screen.getByText('توريد من مورد')).toBeInTheDocument()
  })
})
