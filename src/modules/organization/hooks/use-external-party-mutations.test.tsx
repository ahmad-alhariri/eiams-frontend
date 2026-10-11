import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
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
import {
  useSetExternalPartyStatusMutation,
  useUpdateExternalPartyMutation,
} from './use-external-party-mutations'

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
      http.get(`${API_BASE_URL}/external-parties/${party.id}`, () => {
        detailRequests += 1
        return okJson(detailRequests === 1 ? party : updated)
      }),
      http.put(`${API_BASE_URL}/external-parties/${party.id}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return okJson(updated)
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useExternalPartiesQuery({ page: 1, pageSize: 10 }),
        detail: useExternalPartyQuery(party.id),
        update: useUpdateExternalPartyMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items[0]?.nameAr).toBe('الجهة الأصلية'))
    await waitFor(() => expect(result.current.detail.data?.nameAr).toBe('الجهة الأصلية'))

    await act(async () => {
      await result.current.update.mutateAsync({
        externalPartyId: party.id,
        // `expectedRowVersion` is REQUIRED by the real update body: it echoes the
        // `rowVersion` the read served. The retired upsert type carried a bare
        // `rowVersion` instead, which the binder drops.
        request: { nameAr: party.nameAr, expectedRowVersion: party.rowVersion },
      })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    expect(result.current.list.data?.items[0]?.nameAr).toBe('الجهة المحدّثة')
    expect(result.current.detail.data?.nameAr).toBe('الجهة المحدّثة')
    // `PUT` sends the update body the backend's Update command binds: the
    // editable fields plus the required concurrency guard, and NOT the retired
    // single upsert shape that smuggled `status`/`rowVersion` into the payload.
    expect(updateBodies).toEqual([{ nameAr: party.nameAr, expectedRowVersion: 1 }])
  })

  it('sends the status command as an integer ordinal plus the row version it was read with', async () => {
    const party = createExternalParty({ nameAr: 'جهة للتعطيل', rowVersion: 4 })
    const statusBodies: unknown[] = []
    let listRequests = 0
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () => {
        listRequests += 1
        return okPageJson([party])
      }),
      http.get(`${API_BASE_URL}/external-parties/${party.id}`, () => {
        detailRequests += 1
        return okJson(party)
      }),
      http.put(`${API_BASE_URL}/external-parties/${party.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useExternalPartiesQuery({ page: 1, pageSize: 10 }),
        detail: useExternalPartyQuery(party.id),
        setStatus: useSetExternalPartyStatusMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items[0]?.nameAr).toBe(party.nameAr))
    await waitFor(() => expect(result.current.detail.data?.nameAr).toBe(party.nameAr))
    const listRequestsBefore = listRequests
    const detailRequestsBefore = detailRequests

    // Deactivation: `Inactive` → 1, alongside the guard the route requires.
    await act(async () => {
      await result.current.setStatus.mutateAsync({
        externalPartyId: party.id,
        expectedRowVersion: party.rowVersion,
        status: 'Inactive',
      })
    })

    // Reactivation: `Active` → 0. The SAME route with the other ordinal — the
    // status write is not a "deactivate" endpoint.
    await act(async () => {
      await result.current.setStatus.mutateAsync({
        externalPartyId: party.id,
        expectedRowVersion: party.rowVersion + 1,
        status: 'Active',
      })
    })

    // Both directions hit the one status route, and the ordinals are NUMBERS:
    // `{"status":"Inactive"}` is a JSON binding failure on `[JsonRequired] int Status`.
    expect(statusBodies).toEqual([
      { status: 1, expectedRowVersion: 4 },
      { status: 0, expectedRowVersion: 5 },
    ])
    for (const body of statusBodies) {
      expect(typeof (body as { status: unknown }).status).toBe('number')
    }
    // The refetch after each write is what makes a reactivate carry a version
    // the server still has: a status write bumps `rowVersion`, and replaying the
    // old one is a 409.
    await waitFor(() => expect(listRequests).toBeGreaterThan(listRequestsBefore + 1))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(detailRequestsBefore + 1))
  })
})
