import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' },
}))

const movementsQuery = vi.hoisted(() => ({
  data: undefined as
    | {
        items: ReadonlyArray<Record<string, unknown>>
        meta: {
          page: number
          pageIndex: number
          pageSize: number
          itemCount: number
          totalItems: number
          totalCount: number
          totalPages: number
          hasNextPage: boolean
          hasPreviousPage: boolean
        }
      }
    | undefined,
  isLoading: false,
  isError: false,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/inventory/hooks/use-inventory-queries', () => ({
  useStockMovementsQuery: () => movementsQuery,
}))

import { StockMovementReportTable } from '@/modules/reports/components/stock-movement-report-table'

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
  movementsQuery.data = undefined
  movementsQuery.isLoading = false
  movementsQuery.isError = false
})

/**
 * The stock-movement report reuses the existing inventory movement ledger
 * (D-RPT-01 §"V1 contract matrix"). The underlying read query
 * (`useStockMovementsQuery`) is exhaustively tested in the inventory
 * module's own Vitest suite. This report-level test stubs the hook to
 * assert only the report surface's contract-binding behavior:
 *   - Arabic page title.
 *   - Arabic empty state when the underlying query returns no rows.
 *   - Arabic error state when the underlying query errors.
 */
describe('StockMovementReportTable', () => {
  it('renders the Arabic page title', () => {
    render(<StockMovementReportTable />, { wrapper: createWrapper() })
    expect(
      screen.getByRole('heading', { level: 1, name: 'تقرير حركات المخزون' }),
    ).toBeInTheDocument()

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'تصفية حسب تاريخ البداية' })).toBeInTheDocument()
  })

  it('renders the Arabic empty state when the underlying query returns no rows', () => {
    // The stub mirrors the REAL hook's page shape
    // (`StockMovementPage` → `{ items, meta }`), which is what the inventory
    // module's own pages read.
    movementsQuery.data = {
      items: [],
      meta: {
        page: 1,
        pageIndex: 1,
        pageSize: 10,
        itemCount: 0,
        totalItems: 0,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }
    render(<StockMovementReportTable />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { name: 'لا توجد حركات' })).toBeInTheDocument()
  })

  it('renders the Arabic error state when the underlying query errors', () => {
    movementsQuery.isError = true
    render(<StockMovementReportTable />, { wrapper: createWrapper() })
    expect(
      screen.getByRole('heading', { name: 'تعذّر تحميل تقرير حركات المخزون' }),
    ).toBeInTheDocument()
  })
})
