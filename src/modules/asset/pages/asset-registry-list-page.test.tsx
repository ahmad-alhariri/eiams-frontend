import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { Asset } from '@/modules/asset/types/asset.types'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'
import { formatDate } from '@/shared/utils/format'

import AssetRegistryListPage from './asset-registry-list-page'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const MATERIAL_ID = '22222222-2222-4222-8222-222222222222'
const FIRST_ASSET_ID = '77777777-7777-4777-8777-777777777777'
const SECOND_ASSET_ID = '88888888-8888-4888-8888-888888888888'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

/** The LIVE `GET /assets` row: flat and camelCase. */
function assetRow(overrides: Partial<Asset> = {}): Asset {
  return {
    id: FIRST_ASSET_ID,
    assetNumber: 'AST-2024-C01',
    serialNumber: 'SN-PC-0001',
    materialId: MATERIAL_ID,
    materialCode: 'IT-HW-PC-001',
    materialNameAr: 'حاسوب مكتبي',
    warehouseId: WAREHOUSE_ID,
    warehouseCode: 'WH-CENTRAL',
    warehouseName: 'المستودع المركزي',
    currentStatus: 'InStock',
    activeCustodyId: null,
    holderType: null,
    holderId: null,
    acquisitionDate: '2024-03-01',
    warrantyExpiry: null,
    rowVersion: 1,
    ...overrides,
  }
}

function createWrapper() {
  const client = createQueryClient()
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

let lastAssetsQuery = new URLSearchParams()

function useTwoAssetsHandler() {
  server.use(
    http.get(`${API_BASE_URL}/assets`, ({ request }) => {
      lastAssetsQuery = new URL(request.url).searchParams
      return okPageJson(
        [
          assetRow(),
          assetRow({
            id: SECOND_ASSET_ID,
            assetNumber: 'AST-2023-C099',
            serialNumber: null,
            currentStatus: 'Unknown',
          }),
        ],
        { page: 1, pageSize: 20, totalCount: 2, totalPages: 1 },
      )
    }),
  )
}

describe('AssetRegistryListPage', () => {
  it('renders one row per asset with the live material, warehouse and status', async () => {
    useTwoAssetsHandler()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: /AST-2024-C01/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    // The live row carries the material and warehouse NAMES, flat.
    expect(screen.getAllByText('حاسوب مكتبي').length).toBeGreaterThan(0)
    expect(screen.getAllByText('المستودع المركزي').length).toBeGreaterThan(0)
    // Status badges: the shared registry for the settled states, the module's
    // own Arabic label for the live fifth state (`Unknown`).
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
    expect(screen.getByText('غير معروف')).toBeInTheDocument()
    // The em-dash placeholder belongs to the row's null SERIAL number:
    // `acquisitionDate` is non-nullable on the live Asset type.
    const secondRow = (await screen.findByRole('link', { name: /AST-2023-C099/ })).closest('tr')
    expect(within(secondRow!).getByText('—')).toBeInTheDocument()
    // The DateOnly acquisition date goes through the shared date formatter.
    expect(screen.getAllByText(formatDate('2024-03-01')).length).toBeGreaterThan(0)
  })

  it('links each asset number to its detail route by the live id', async () => {
    useTwoAssetsHandler()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    const link = await screen.findByRole('link', { name: /AST-2024-C01/ })
    expect(link.getAttribute('href')).toBe(`/assets/${FIRST_ASSET_ID}`)
  })

  it('passes the selected status as a live list filter and resets paging', async () => {
    useTwoAssetsHandler()
    const user = userEvent.setup()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    await screen.findByRole('link', { name: /AST-2024-C01/ })
    lastAssetsQuery = new URLSearchParams()

    await user.click(screen.getByLabelText('تصفية حسب الحالة الحالية'))
    await user.click(await screen.findByRole('option', { name: 'في المخزن' }))

    // The query refires with the new filter.
    await screen.findByRole('link', { name: /AST-2024-C01/ })
    expect(lastAssetsQuery.get('status')).toBe('InStock')
    // The wire page is ONE-based; the snapshot's pageIndex is never sent.
    expect(lastAssetsQuery.get('page')).toBe('1')
    expect(lastAssetsQuery.has('pageIndex')).toBe(false)
  })

  it('offers every live status, including the fifth one', async () => {
    useTwoAssetsHandler()
    const user = userEvent.setup()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    await screen.findByRole('link', { name: /AST-2024-C01/ })
    await user.click(screen.getByLabelText('تصفية حسب الحالة الحالية'))

    expect(await screen.findByRole('option', { name: 'في المخزن' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'مصروف' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'قيد العهدة' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'مستبعد' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'غير معروف' })).toBeInTheDocument()
  })

  it('shows the empty state when no assets match', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets`, () =>
        okPageJson([], { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }),
      ),
    )
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('لا توجد أصول')).toBeInTheDocument()
  })
})
