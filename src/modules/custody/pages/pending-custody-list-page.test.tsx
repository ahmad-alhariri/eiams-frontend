import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { PendingCustody } from '@/modules/custody/types/custody.types'
import { server } from '@/test/msw/server'

import PendingCustodyListPage from './pending-custody-list-page'

const API_BASE_URL = '/api/v1'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'warehouse' as const, id: '33333333-3333-4333-8333-333333333333' } as
    { kind: 'warehouse'; id: string } | { kind: 'enterprise' },
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const permissionState = vi.hoisted(() => ({ canAssign: true }))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: () => permissionState.canAssign }),
}))

/** The LIVE `GET /custodies/pending` row. */
const pendingRow: PendingCustody = {
  custodyId: '44444444-4444-4444-8444-444444444444',
  assetId: ASSET_ID,
  assetNumber: 'AST-2023-C099',
  materialId: '22222222-2222-4222-8222-222222222222',
  holderType: 'OrganizationalUnit',
  holderId: '55555555-5555-4555-8555-555555555555',
  issueDocumentId: '66666666-6666-4666-8666-666666666666',
  fromUtc: '2026-08-01T08:00:00.000Z',
  rowVersion: 1,
}

let pendingRequests = 0
let requestedParams: URLSearchParams | undefined

function usePendingHandler() {
  server.use(
    http.get(`${API_BASE_URL}/custodies/pending`, ({ request }) => {
      pendingRequests += 1
      requestedParams = new URL(request.url).searchParams
      return okPageJson([pendingRow], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
    }),
  )
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

describe('PendingCustodyListPage', () => {
  it('reads the live pending endpoint for the active warehouse', async () => {
    usePendingHandler()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(requestedParams?.get('warehouseId')).toBe(WAREHOUSE_ID)
    expect(requestedParams?.get('page')).toBe('1')
    // The holder travels as a type + id pair: the pending row carries no name.
    expect(
      screen.getByText('OrganizationalUnit:55555555-5555-4555-8555-555555555555'),
    ).toBeInTheDocument()
  })

  it('shows the assign action to a custody.assign holder', async () => {
    usePendingHandler()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تكليف موظف' })).toBeInTheDocument()
  })

  it('opens the assignment dialog with the asset context and closes on cancel', async () => {
    usePendingHandler()
    const user = userEvent.setup()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    await user.click(screen.getByRole('button', { name: 'تكليف موظف' }))

    expect(screen.getByText('تكليف حفظ شخصي')).toBeInTheDocument()
    // The dialog names the asset being assigned (link in row + dialog text).
    expect(screen.getAllByText(/AST-2023-C099/).length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getAllByRole('button', { name: 'إلغاء' })[0]!)
    expect(screen.queryByText('تكليف حفظ شخصي')).toBeNull()
  })

  it('hides the assign action for users without custody.assign', async () => {
    permissionState.canAssign = false
    usePendingHandler()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    await screen.findByRole('link', { name: /AST-2023-C099/ })
    expect(screen.queryByRole('button', { name: 'تكليف موظف' })).toBeNull()
    permissionState.canAssign = true
  })

  it('asks for a warehouse instead of reading one that the server cannot resolve', async () => {
    activeScope.key = { kind: 'enterprise' }
    pendingRequests = 0
    usePendingHandler()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByText('اختر المستودع لعرض الأصول التي تنتظر التكليف الشخصي.'),
    ).toBeInTheDocument()
    // The live endpoint binds a non-nullable warehouse id, so no request may
    // leave without one.
    expect(pendingRequests).toBe(0)
    activeScope.key = { kind: 'warehouse', id: WAREHOUSE_ID }
  })
})
