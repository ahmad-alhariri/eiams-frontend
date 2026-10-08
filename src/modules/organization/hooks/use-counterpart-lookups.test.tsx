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
import type { CounterpartResolution } from '@/modules/organization/types/counterpart-lookup.types'

const API_BASE_URL = '/api/v1'

/**
 * `useActiveCounterpartOptions` delegates to `counterpartLookupService`, which
 * reads the REAL `GET /counterparts` route (operation=Issue, type=Employee).
 * The previous handler pointed at a fictional `/organization/external-parties/
 * active/search` path that no production code and no backend route uses, so it
 * never matched. It also rendered the hook with no `QueryClientProvider`,
 * which threw "No QueryClient set" before any assertion ran.
 */
function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const active: CounterpartResolution = {
  type: 'Employee',
  id: 'aaaaaaaa-4aaa-0aaa-8aaa-aaaaaaaaaaaa',
  displayName: 'أحمد محمد',
  secondaryLabelAr: 'مهندس مدني',
  status: 'Active',
}

const archived: CounterpartResolution = {
  type: 'Employee',
  id: 'bbbbbbbb-4bbb-0bbb-8bbb-bbbbbbbbbbbb',
  displayName: 'جهة مؤرشفة',
  secondaryLabelAr: null,
  status: 'Inactive',
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('use-active-counterpart-options', () => {
  it('returns matched counterpart options as AsyncSelect-ready labels', async () => {
    const requestedQueries: Record<string, string>[] = []

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
        requestedQueries.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([active], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
    )

    const { result } = renderHook(
      () => useActiveCounterpartOptions({ operation: 'Issue', type: 'Employee' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    const options = await result.current.loadOptions('أحمد')

    expect(options).toEqual([
      expect.objectContaining({
        value: active.id,
        label: 'أحمد محمد — مهندس مدني',
        disabled: false,
      }),
    ])
    expect(requestedQueries.at(-1)?.['search']).toBe('أحمد')
    expect(requestedQueries.at(-1)?.['operation']).toBe('Issue')
    expect(requestedQueries.at(-1)?.['type']).toBe('Employee')
    // The write selector asks for ten records, the default page size for a
    // single debounced search; the backend's own cap is wider.
    expect(requestedQueries.at(-1)?.['pageSize']).toBe('10')
  })

  it('returns an empty option list when no counterpart matches', async () => {
    server.use(
      http.get(`${API_BASE_URL}/counterparts`, () =>
        okPageJson([], { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }),
      ),
    )

    const { result } = renderHook(
      () => useActiveCounterpartOptions({ operation: 'Issue', type: 'Employee' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    await expect(result.current.loadOptions('xyz')).resolves.toEqual([])
  })

  it('keeps an archived counterpart out of the active write choices', async () => {
    server.use(
      http.get(`${API_BASE_URL}/counterparts`, () =>
        okPageJson([active, archived], { page: 1, pageSize: 10, totalCount: 2, totalPages: 1 }),
      ),
    )

    const { result } = renderHook(
      () => useActiveCounterpartOptions({ operation: 'Issue', type: 'Employee' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loadOptions).toBeInstanceOf(Function))
    const options = await result.current.loadOptions('')

    expect(options.map((option) => option.value)).toEqual([active.id])
  })
})
