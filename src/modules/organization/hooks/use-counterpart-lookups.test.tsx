import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useActiveCounterpartOptions } from '@/modules/organization/hooks/use-counterpart-lookups'
import type { ExternalParty } from '@/modules/organization/types/organization.api-types'

const API_BASE_URL = '/api/v1'

/**
 * `useActiveCounterpartOptions` delegates to `counterpartLookupService`, which
 * reads the REAL `GET /external-parties` route. The previous handler pointed at
 * a fictional `/organization/external-parties/active/search` path that no
 * production code and no backend route (`[Route("external-parties")]`) uses, so
 * it never matched. It also rendered the hook with no `QueryClientProvider`,
 * which threw "No QueryClient set" before any assertion ran.
 */
function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const active: ExternalParty = {
  externalPartyId: 'aaaaaaaa-4aaa-0aaa-8aaa-aaaaaaaaaaaa',
  code: 'EXT-001',
  nameAr: 'أحمد محمد',
  status: 'Active',
  rowVersion: 0,
}

const archived: ExternalParty = {
  externalPartyId: 'bbbbbbbb-4bbb-0bbb-8bbb-bbbbbbbbbbbb',
  code: 'EXT-002',
  nameAr: 'جهة مؤرشفة',
  status: 'Inactive',
  rowVersion: 3,
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('use-active-counterpart-options', () => {
  it('returns matched counterpart options as AsyncSelect-ready labels', async () => {
    const requestedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([active], { page: 1, pageSize: 100, totalCount: 1, totalPages: 1 })
      }),
    )

    const { result } = renderHook(() => useActiveCounterpartOptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    const options = await result.current.loadOptions('أحمد')

    expect(options).toEqual([
      expect.objectContaining({
        value: active.externalPartyId,
        label: 'أحمد محمد — EXT-001',
        disabled: false,
      }),
    ])
    expect(requestedQueries.at(-1)?.['search']).toBe('أحمد')
    // The write selector asks for Active rows server-side and narrows to ten.
    expect(requestedQueries.at(-1)?.['pageSize']).toBe('100')
  })

  it('returns an empty option list when no counterpart matches', async () => {
    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () =>
        okPageJson([], { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 }),
      ),
    )

    const { result } = renderHook(() => useActiveCounterpartOptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    await expect(result.current.loadOptions('xyz')).resolves.toEqual([])
  })

  it('keeps an archived counterpart out of the active write choices', async () => {
    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () =>
        okPageJson([active, archived], { page: 1, pageSize: 100, totalCount: 2, totalPages: 1 }),
      ),
    )

    const { result } = renderHook(() => useActiveCounterpartOptions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    const options = await result.current.loadOptions('')

    expect(options.map((option) => option.value)).toEqual([active.externalPartyId])
  })
})
