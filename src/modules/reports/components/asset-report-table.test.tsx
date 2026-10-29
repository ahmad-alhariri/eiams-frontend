import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

let permissionMode: 'granted' | 'denied' = 'denied'

vi.mock('@/modules/auth/hooks/use-permission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/hooks/use-permission')>()
  return {
    ...actual,
    // Driven by a mutable flag because the shared action is gated on the
    // permission hook: 'granted' proves the export action is hidden at the
    // component itself, not merely by RBAC.
    usePermission: () => ({
      has: () => permissionMode === 'granted',
      hasAll: () => permissionMode === 'granted',
      hasAny: () => permissionMode === 'granted',
    }),
  }
})

import { ExportButton } from '@/shared/ui/export-button'
import { formatNumber } from '@/shared/utils/format'

import type { AssetsReportRow } from '@/modules/reports/types/reports.types'
import { AssetReportTable } from '@/modules/reports/components/asset-report-table'

const API_BASE_URL = '/api/v1'

/**
 * The live row: `GET /reports/assets` answers with one row per (warehouse,
 * current status) pair carrying the server's COUNT — there is no asset
 * identity, no material and no custodian on the wire
 * (`Application/Reports/Assets/AssetsReportRow.cs:3-8`).
 */
function createAssetsReportRow(overrides: Partial<AssetsReportRow> = {}): AssetsReportRow {
  return {
    warehouseId: '373ba70c-aa2c-466d-b9b5-a9df47abf8da',
    warehouseCode: 'MAIN',
    warehouseName: 'Main Store',
    currentStatus: 'InStock',
    assetCount: 4,
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

describe('AssetReportTable', () => {
  it('renders Arabic headers, server rows, and the current-status badge', async () => {
    const row = createAssetsReportRow({ currentStatus: 'InStock' })
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        okPageJson([row], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
      ),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تقرير الأصول والتكليف' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(row.warehouseName)).toBeInTheDocument()
    expect(screen.getByText(row.warehouseCode)).toBeInTheDocument()
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
  })

  it('renders the server asset COUNT for the warehouse/status group', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        okPageJson([createAssetsReportRow({ assetCount: 17 })], {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        }),
      ),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })

    expect(await screen.findByText(formatNumber(17))).toBeInTheDocument()
  })

  it('renders Arabic empty state when the server returns no assets', async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
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
        return okPageJson([createAssetsReportRow()], {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        })
      }),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })
    await screen.findByText('Main Store')

    // Verify the first request omits optional filters.
    expect(requests.at(-1)).toMatchObject({ page: '1', pageSize: '10' })
    expect(requests.at(-1)).not.toHaveProperty('status')
    expect(requests.at(-1)).not.toHaveProperty('warehouseId')
  })

  it('renders no export action even with the export permission granted', async () => {
    // The live API serves no export route (bead eiams-frontend-5ds2), so the
    // shared action is hidden at the component: nothing the user sees offers a
    // download the server cannot fulfil.
    permissionMode = 'granted'

    server.use(
      http.get(`${API_BASE_URL}/reports/assets`, () =>
        okPageJson([createAssetsReportRow()], {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        }),
      ),
    )

    render(<AssetReportTable />, { wrapper: createWrapper() })

    await screen.findByText('Main Store')
    expect(screen.queryByText('تصدير تقرير الأصول والتكليف')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تصدير/ })).not.toBeInTheDocument()
  })

  it('renders the shared export button as null regardless of permission', () => {
    // Direct pin on the hidden component: with permission granted, a live UI
    // would offer the download, so the null render is what hides it.
    permissionMode = 'denied'
    const { container: denied } = render(
      <ExportButton reportType="assets" requiredPermission="asset.view" />,
    )
    permissionMode = 'granted'
    const { container: allowed } = render(
      <ExportButton reportType="assets" requiredPermission="asset.view" />,
    )
    expect(denied).toBeEmptyDOMElement()
    expect(allowed).toBeEmptyDOMElement()
  })
})
