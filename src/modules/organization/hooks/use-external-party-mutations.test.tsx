import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createExternalParty } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useExternalPartiesQuery, useExternalPartyQuery } from './use-organization-queries'
import { useUpdateExternalPartyMutation } from './use-external-party-mutations'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('external-party mutation cache invalidation', () => {
  it('refetches both the list and the detail query after an update', async () => {
    const party = createExternalParty({ nameAr: 'الجهة الأصلية' })
    const updated = { ...party, nameAr: 'الجهة المحدّثة' }
    let listRequests = 0
    let detailRequests = 0
    const updateBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () => {
        listRequests += 1
        return okPageJson([listRequests === 1 ? party : updated], {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        })
      }),
      http.get(`${API_BASE_URL}/external-parties/${party.externalPartyId}`, () => {
        detailRequests += 1
        return okJson(detailRequests === 1 ? party : updated)
      }),
      http.put(`${API_BASE_URL}/external-parties/${party.externalPartyId}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return okJson(updated)
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useExternalPartiesQuery({ page: 0, pageSize: 10 }),
        detail: useExternalPartyQuery(party.externalPartyId),
        update: useUpdateExternalPartyMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items[0]?.nameAr).toBe('الجهة الأصلية'))
    await waitFor(() => expect(result.current.detail.data?.nameAr).toBe('الجهة الأصلية'))

    await act(async () => {
      await result.current.update.mutateAsync({
        externalPartyId: party.externalPartyId,
        request: { ...party, rowVersion: 1 },
      })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    expect(result.current.list.data?.items[0]?.nameAr).toBe('الجهة المحدّثة')
    expect(result.current.detail.data?.nameAr).toBe('الجهة المحدّثة')
    // `PUT` sends the versioned upsert body the backend's Update command binds.
    expect(updateBodies).toEqual([{ ...party, rowVersion: 1 }])
  })
})
