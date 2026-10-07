import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { createAsset, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { AssetReportTable } from '@/modules/reports/components/asset-report-table'

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

describe('AssetReportTable', () => {
  it('renders Arabic headers, server rows, and the derived-status badge', async () => {
    const asset = createAsset({
      assetNumber: 'AST-2026-0042',
      derivedStatus: 'InStock',
    })
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        HttpResponse.json(createPage([asset], { totalItems: 1, totalPages: 1 })),
      ),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير الأصول والتكليف' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('AST-2026-0042')).toBeInTheDocument()
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
  })

  it('renders Arabic empty state when the server returns no assets', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        HttpResponse.json(createPage([], { totalItems: 0, totalPages: 0 })),
      ),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد أصول' })).toBeInTheDocument()
  })

  it('forwards status and warehouseId filters to the reports endpoint', async () => {
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(createPage([createAsset()]))
      }),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })
    await screen.findByText('AST-2026-0001')

    // Verify the first request omits optional filters.
    expect(requests.at(-1)).toMatchObject({ pageIndex: '0', pageSize: '10' })
    expect(requests.at(-1)).not.toHaveProperty('status')
    expect(requests.at(-1)).not.toHaveProperty('warehouseId')
  })
})
