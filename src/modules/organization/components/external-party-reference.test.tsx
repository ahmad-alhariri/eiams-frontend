import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ExternalPartyReference } from '@/modules/organization/components/external-party-reference'
import { createQueryClient } from '@/shared/services/query.client'
import { createExternalParty } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function QueryWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

describe('ExternalPartyReference', () => {
  it('keeps an inactive party readable for historic IssueTo and Custody views', async () => {
    const party = createExternalParty({ nameAr: 'الجهة المؤرشفة', status: 'Inactive' })
    server.use(
      http.get(`${API_BASE_URL}/external-parties/${party.externalPartyId}`, () =>
        HttpResponse.json(party),
      ),
    )

    render(<ExternalPartyReference externalPartyId={party.externalPartyId} />, {
      wrapper: QueryWrapper,
    })

    await waitFor(() => expect(screen.getByText('الجهة المؤرشفة')).toBeInTheDocument())
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
  })
})
