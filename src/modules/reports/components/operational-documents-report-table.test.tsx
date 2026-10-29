import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http } from 'msw'

import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { formatDateTime, formatNumber } from '@/shared/utils/format'
import { formatArabicDate } from '@/shared/ui/calendar-utils'

import type { DocumentsReportRow } from '@/modules/reports/types/reports.types'
import { OperationalDocumentsReportTable } from '@/modules/reports/components/operational-documents-report-table'

const API_BASE_URL = '/api/v1'

/**
 * The live row: `GET /reports/documents` answers with one row per (warehouse,
 * document type, document status) triple carrying the server's COUNT and the
 * newest timestamps of that group
 * (`Application/Reports/Documents/DocumentsReportRow.cs:3-11`). There is no
 * document identity on the wire — no reference number, no paper number, no
 * attachments.
 */
function createDocumentsReportRow(overrides: Partial<DocumentsReportRow> = {}): DocumentsReportRow {
  return {
    warehouseId: '373ba70c-aa2c-466d-b9b5-a9df47abf8da',
    warehouseCode: 'MAIN',
    warehouseName: 'Main Store',
    documentType: 'Receiving',
    documentStatus: 'Posted',
    documentCount: 9,
    latestCreatedAtUtc: '2026-09-01T00:00:00.000Z',
    latestPostedAtUtc: '2026-09-02T00:00:00.000Z',
    ...overrides,
  }
}

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
  it('renders the Arabic document-type label, the status badge and the server count', async () => {
    const createdAt = '2026-09-01T00:00:00.000Z'
    const row = createDocumentsReportRow({ latestCreatedAtUtc: createdAt })
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        okPageJson([row], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير المستندات التشغيلية' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(row.warehouseName)).toBeInTheDocument()
    expect(screen.getByText(row.warehouseCode)).toBeInTheDocument()
    expect(screen.getByText('سند استلام')).toBeInTheDocument()
    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    expect(screen.getByText(formatNumber(row.documentCount))).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(createdAt))).toBeInTheDocument()
  })

  it('renders a placeholder for a group that was never posted', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        okPageJson(
          [createDocumentsReportRow({ documentStatus: 'Draft', latestPostedAtUtc: null })],
          { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
        ),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByText('مسودة')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('does not expose an uncontracted document-type filter', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    // The contract binds `documentType`, but this screen offers the warehouse
    // and the date window only — so no type Select may exist.
    expect(screen.queryByRole('combobox', { name: /النوع/ })).not.toBeInTheDocument()
  })

  it('uses the Arabic DatePicker instead of native datetime-local and keeps the wire contract', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([])
      }),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'تقرير المستندات التشغيلية' })

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'تصفية حسب تاريخ البداية' })).toBeInTheDocument()

    const today = new Date()
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 15)
    await user.click(screen.getByRole('button', { name: 'تصفية حسب تاريخ البداية' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(fromDate) }))

    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        fromUtc: fromDate.toISOString(),
      }),
    )
  })

  it('renders the Arabic empty state when the server returns no documents', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/documents`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
      ),
    )

    render(<OperationalDocumentsReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'لا توجد مستندات تشغيلية' }),
    ).toBeInTheDocument()
  })
})
