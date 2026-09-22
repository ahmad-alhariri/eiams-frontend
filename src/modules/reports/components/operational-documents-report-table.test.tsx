import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { OperationalDocumentsReportTable } from '@/modules/reports/components/operational-documents-report-table'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('OperationalDocumentsReportTable', () => {
  it('renders Arabic document-type labels and does not expose an uncontracted type filter', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        HttpResponse.json({
          items: [
            {
              documentId: 'd1',
              systemReferenceNumber: 'DOC-2026-0042',
              paperDocumentNumber: '142',
              paperDocumentYear: 2026,
              documentType: 'Receiving',
              documentStatus: 'Posted',
              warehouse: { id: 'w1', displayName: 'المستودع المركزي' },
              site: { id: 's1', displayName: 'المقر الرئيسي' },
              createdAt: '2026-09-01T00:00:00.000Z',
              createdBy: { id: 'u1', displayName: 'موظف استلام' },
              attachments: [],
              lines: [],
              policy: {
                actions: [],
                advisories: [],
                blockers: [],
                documentId: 'd1',
                documentStatus: 'Posted',
                evaluatedAt: '2026-09-01T00:00:00.000Z',
                policyKind: 'Receiving',
                rowVersion: 1,
                signedOriginalSatisfied: true,
              },
              postedAt: null,
              rowVersion: 1,
            },
          ],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 1, totalPages: 1 },
        }),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير المستندات التشغيلية' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('DOC-2026-0042')).toBeInTheDocument()
    expect(screen.getByText('سند استلام')).toBeInTheDocument()
    // The contract has no `documentType` query parameter; the page must
    // not expose one as a Select/SelectItem.
    expect(screen.queryByRole('combobox', { name: /النوع/ })).not.toBeInTheDocument()
  })

  it('renders the Arabic empty state when the server returns no documents', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 0 },
        }),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'لا توجد مستندات تشغيلية' }),
    ).toBeInTheDocument()
  })
})
