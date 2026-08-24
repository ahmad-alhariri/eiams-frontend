import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createAsset, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

import AssetRegistryListPage from './asset-registry-list-page'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(30)
const MATERIAL_ID = fixtureUuid(61)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

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
      return HttpResponse.json({
        items: [
          createAsset({
            assetId: fixtureUuid(230),
            assetNumber: 'AST-2024-C01',
            serialNumber: 'SN-PC-0001',
            derivedStatus: 'InStock',
            material: { id: MATERIAL_ID, displayName: 'حاسوب مكتبي' },
            currentWarehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
            acquisitionDate: '2024-03-01',
          }),
          createAsset({
            assetId: fixtureUuid(231),
            assetNumber: 'AST-2023-C099',
            serialNumber: null,
            derivedStatus: 'Issued',
            material: { id: MATERIAL_ID, displayName: 'حاسوب مكتبي' },
            currentWarehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
          }),
        ],
        meta: { pageIndex: 0, pageSize: 20, totalItems: 2, totalPages: 1 },
      })
    }),
  )
}

describe('AssetRegistryListPage (e18-t02)', () => {
  it('renders the Arabic heading and one registry row per asset with status badges', async () => {
    useTwoAssetsHandler()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: /AST-2024-C01/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    // Derived-status badges from the shared StatusBadge registry.
    expect(screen.getAllByText('في المخزن').length).toBeGreaterThan(0)
    expect(screen.getByText('مصروف')).toBeInTheDocument()
    // Missing acquisition date renders the em-dash placeholder.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('links each asset number to its detail route', async () => {
    useTwoAssetsHandler()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    const link = await screen.findByRole('link', { name: /AST-2024-C01/ })
    expect(link.getAttribute('href')).toBe(`/assets/${fixtureUuid(230)}`)
  })

  it('passes the selected derived status as a list filter and resets paging', async () => {
    useTwoAssetsHandler()
    const user = userEvent.setup()
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    await screen.findByRole('link', { name: /AST-2024-C01/ })
    lastAssetsQuery = new URLSearchParams()

    await user.click(screen.getByLabelText('تصفية حسب الحالة المشتقة'))
    await user.click(await screen.findByRole('option', { name: 'في المخزن' }))

    // The query refires with the new filter.
    await screen.findByRole('link', { name: /AST-2024-C01/ })
    expect(lastAssetsQuery.get('status')).toBe('InStock')
  })

  it('shows the empty state when no assets match', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets`, () =>
        HttpResponse.json({
          items: [],
          meta: { pageIndex: 0, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
      ),
    )
    render(<AssetRegistryListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('لا توجد أصول')).toBeInTheDocument()
  })
})
