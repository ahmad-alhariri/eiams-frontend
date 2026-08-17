import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ExternalPartiesPage from '@/modules/organization/pages/external-parties-page'
import { createQueryClient } from '@/shared/services/query.client'
import { createExternalParty, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const scope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: scope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'organization.manage' && permissions.canManage,
  }),
}))

const API_BASE_URL = '/api/v1'

function PageWrapper({ children }: PropsWithChildren) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ExternalPartiesPage', () => {
  it('shows active and inactive records but hides write actions without organization.manage', async () => {
    permissions.canManage = false
    const activeParty = createExternalParty({ nameAr: 'جهة نشطة', status: 'Active' })
    const inactiveParty = createExternalParty({
      externalPartyId: '00000000-0000-4000-8000-000000000055',
      nameAr: 'جهة معطلة',
      status: 'Inactive',
    })
    let receivedPageIndex: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        receivedPageIndex = new URL(request.url).searchParams.get('pageIndex')
        return HttpResponse.json(createPage([activeParty, inactiveParty]))
      }),
    )

    render(<ExternalPartiesPage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText('جهة نشطة')).toBeInTheDocument())
    expect(screen.getByText('جهة معطلة')).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة جهة خارجية' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعطيل/ })).not.toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
  })
})
