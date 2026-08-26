import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import PendingCustodyListPage from './pending-custody-list-page'

const API_BASE_URL = '/api/v1'
const ASSET_ID = fixtureUuid(235)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

const permissionState = vi.hoisted(() => ({ canAssign: true }))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: () => permissionState.canAssign }),
}))

function usePendingHandler() {
  server.use(
    http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('status')).toBe('Active')
      expect(url.searchParams.get('custodyKind')).toBe('Operational')
      return HttpResponse.json({
        items: [
          {
            assetId: ASSET_ID,
            assetNumber: 'AST-2023-C099',
            custodyId: fixtureUuid(52),
            custodyKind: 'Operational',
            fromTs: '2026-08-01T08:00:00.000Z',
            holder: {
              displayName: 'مديرية النقل والحراسة',
              id: fixtureUuid(21),
              secondaryLabelAr: null,
              status: 'Active' as const,
              type: 'OrganizationalUnit' as const,
            },
            issueDocumentId: fixtureUuid(155),
            rowVersion: 1,
            status: 'Active',
          },
        ],
        meta: { pageIndex: 0, pageSize: 20, totalItems: 1, totalPages: 1 },
      })
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

describe('PendingCustodyListPage (e19-t02)', () => {
  it('renders pending operational custody rows with holder and assign action', async () => {
    usePendingHandler()
    render(<PendingCustodyListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: /AST-2023-C099/ })).toBeInTheDocument()
    expect(screen.getByText(/مديرية النقل والحراسة/)).toBeInTheDocument()
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
  })
})
