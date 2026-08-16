import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { ExternalPartySelect } from '@/modules/organization/components/external-party-select'
import { createExternalParty, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function SelectWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

describe('ExternalPartySelect', () => {
  it('uses active-only server search and never offers in-document creation', async () => {
    const party = createExternalParty({ nameAr: 'الجهة النشطة' })
    let requestedStatus: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        requestedStatus = new URL(request.url).searchParams.get('status')
        return HttpResponse.json(createPage([party]))
      }),
    )

    render(<ExternalPartySelect onValueChange={() => undefined} />, { wrapper: SelectWrapper })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'الجهة' } })

    await waitFor(() =>
      expect(screen.getByRole('option')).toHaveTextContent('الجهة النشطة — EXT-001'),
    )
    expect(requestedStatus).toBe('Active')
    expect(screen.queryByText(/إضافة جديد/)).not.toBeInTheDocument()
  })
})
