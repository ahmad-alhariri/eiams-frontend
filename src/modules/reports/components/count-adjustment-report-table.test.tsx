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

import { CountAdjustmentReportTable } from '@/modules/reports/components/count-adjustment-report-table'

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

describe('CountAdjustmentReportTable', () => {
  it('renders Arabic headers and Arabic adjustment labels', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, () =>
        HttpResponse.json({
          items: [
            {
              adjustmentId: 'a1',
              documentId: 'd1',
              documentReference: 'ADJ-2026-0001',
              purpose: 'CountVariance',
              status: 'Posted',
              reason: 'فروقات جرد دوري',
              countReference: 'CNT-2026-0001',
              warehouse: { id: 'w1', displayName: 'المستودع المركزي' },
              createdAt: '2026-09-01T00:00:00.000Z',
              createdBy: { id: 'u1', displayName: 'مدير الجرد' },
              postedAt: '2026-09-01T00:00:00.000Z',
              lines: [],
              policy: {
                actions: [],
                advisories: [],
                blockers: [],
                documentId: 'd1',
                documentStatus: 'Posted',
                evaluatedAt: '2026-09-01T00:00:00.000Z',
                policyKind: 'Adjustment',
                rowVersion: 1,
                signedOriginalSatisfied: true,
              },
              rowVersion: 1,
              attachments: [],
            },
          ],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 1, totalPages: 1 },
        }),
      ),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير الجرد والتسويات' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('ADJ-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('تسوية فروقات الجرد')).toBeInTheDocument()
    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    expect(screen.getByText('CNT-2026-0001')).toBeInTheDocument()
  })

  it('forwards the documented warehouse and date filters verbatim', async () => {
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 0 },
        })
      }),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    await screen.findByRole('heading', { level: 1, name: 'تقرير الجرد والتسويات' })

    const last = requests.at(-1) ?? {}
    expect(last).toMatchObject({ pageIndex: '0', pageSize: '10' })
    // Date and warehouse filters must not be forwarded when the user has
    // not set them (no fabricated defaults, per D-RPT-01 §"Filters and pagination").
    expect(last).not.toHaveProperty('warehouseId')
    expect(last).not.toHaveProperty('dateFrom')
    expect(last).not.toHaveProperty('dateTo')
  })

  it('renders the Arabic empty state when the server returns no adjustments', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/count-adjustments`, () =>
        HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 10, totalItems: 0, totalPages: 0 },
        }),
      ),
    )

    render(<CountAdjustmentReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد تسويات' })).toBeInTheDocument()
  })
})
