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

import { formatNumber } from '@/shared/utils/format'
import { formatArabicDate } from '@/shared/ui/calendar-utils'

import type { CountAdjustmentsReportRow } from '@/modules/reports/types/reports.types'
import { CountAdjustmentReportTable } from '@/modules/reports/components/count-adjustment-report-table'

const API_BASE_URL = '/api/v1'

/**
 * The live row: `GET /reports/count-adjustments` answers with one row per
 * warehouse, aggregating the counts and the adjustments of that warehouse
 * inside the requested date window
 * (`Application/Reports/CountAdjustments/CountAdjustmentsReportRow.cs:3-13`).
 * There is no adjustment document, no count reference and no purpose on the
 * wire — only the server's counters and sums.
 */
function createCountAdjustmentsReportRow(
  overrides: Partial<CountAdjustmentsReportRow> = {},
): CountAdjustmentsReportRow {
  return {
    warehouseId: '373ba70c-aa2c-466d-b9b5-a9df47abf8da',
    warehouseCode: 'MAIN',
    warehouseName: 'Main Store',
    countCount: 13,
    closedCountCount: 7,
    varianceLineCount: 3,
    netVariance: -41,
    adjustmentCount: 24,
    postedAdjustmentCount: 8,
    adjustmentDifference: 20,
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

describe('CountAdjustmentReportTable', () => {
  it('renders Arabic headers and the server counters for the warehouse', async () => {
    const row = createCountAdjustmentsReportRow()
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, () =>
        okPageJson([row], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
      ),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير الجرد والتسويات' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(row.warehouseName)).toBeInTheDocument()
    expect(screen.getByText(row.warehouseCode)).toBeInTheDocument()
    // The server's counters — the client renders them, it never recomputes them.
    expect(screen.getByText(formatNumber(row.countCount))).toBeInTheDocument()
    expect(screen.getByText(formatNumber(row.closedCountCount))).toBeInTheDocument()
    expect(screen.getByText(formatNumber(row.adjustmentCount))).toBeInTheDocument()
    expect(screen.getByText(formatNumber(row.postedAdjustmentCount))).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'صافي الفروقات' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'فرق التسويات' })).toBeInTheDocument()
  })

  it('forwards the documented warehouse and date filters verbatim', async () => {
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 })
      }),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    await screen.findByRole('heading', { name: 'تقرير الجرد والتسويات' })

    const last = requests.at(-1) ?? {}
    expect(last).toMatchObject({ page: '1', pageSize: '10' })
    // Date and warehouse filters must not be forwarded when the user has
    // not set them (no fabricated defaults, per D-RPT-01 §"Filters and pagination").
    expect(last).not.toHaveProperty('warehouseId')
    expect(last).not.toHaveProperty('fromUtc')
    expect(last).not.toHaveProperty('toUtc')
  })

  it('uses the Arabic DatePicker instead of native datetime-local and keeps the wire contract', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([])
      }),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'تقرير الجرد والتسويات' })

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

  it('renders the Arabic empty state when the server returns no adjustments', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
      ),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد تسويات' })).toBeInTheDocument()
  })
})
