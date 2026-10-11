import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createOrganizationalUnit } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useOrganizationalUnitsQuery, useOrganizationalUnitQuery } from './use-organization-queries'
import {
  useSetOrganizationalUnitStatusMutation,
  useUpdateOrganizationalUnitMutation,
} from './use-organizational-unit-mutations'

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

describe('organizational-unit mutation cache invalidation', () => {
  it('refetches both the list and the detail query after an update', async () => {
    const unit = createOrganizationalUnit()
    let listRequests = 0
    let detailRequests = 0
    const updateBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => {
        listRequests += 1
        return okPageJson([unit], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/organizational-units/${unit.id}`, () => {
        detailRequests += 1
        return okJson(unit)
      }),
      http.put(`${API_BASE_URL}/organizational-units/${unit.id}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useOrganizationalUnitsQuery({ page: 1, pageSize: 10 }),
        detail: useOrganizationalUnitQuery(unit.id),
        update: useUpdateOrganizationalUnitMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.name).toBe(unit.name))

    await act(async () => {
      await result.current.update.mutateAsync({
        orgUnitId: unit.id,
        request: { name: 'Ø§Ù„ÙˆØ­Ø¯Ø© Ø§Ù„Ù…Ø­Ø¯Ù‘Ø«Ø©', unitType: 'Section' },
      })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    // `PUT /organizational-units/{id}` binds name and unitType only: neither
    // `siteId` nor `parentId` (re-siting and re-parenting are not exposed).
    expect(updateBodies).toEqual([{ name: 'Ø§Ù„ÙˆØ­Ø¯Ø© Ø§Ù„Ù…Ø­Ø¯Ù‘Ø«Ø©', unitType: 'Section' }])
  })

  it('sends an integer status command body in BOTH directions, with no version guard', async () => {
    const unit = createOrganizationalUnit()
    const statusBodies: unknown[] = []
    let listRequests = 0
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => {
        listRequests += 1
        return okPageJson([unit])
      }),
      http.get(`${API_BASE_URL}/organizational-units/${unit.id}`, () => {
        detailRequests += 1
        return okJson(unit)
      }),
      http.put(`${API_BASE_URL}/organizational-units/${unit.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useOrganizationalUnitsQuery({ page: 1, pageSize: 10 }),
        detail: useOrganizationalUnitQuery(unit.id),
        setStatus: useSetOrganizationalUnitStatusMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.name).toBe(unit.name))

    const listRequestsBefore = listRequests
    const detailRequestsBefore = detailRequests

    // Deactivation then reactivation: the SAME route with the other ordinal.
    await act(async () => {
      await result.current.setStatus.mutateAsync({ orgUnitId: unit.id, status: 'Inactive' })
    })
    await act(async () => {
      await result.current.setStatus.mutateAsync({ orgUnitId: unit.id, status: 'Active' })
    })

    // `[JsonRequired] int Status`: the ORDINAL, never the status name the read
    // served, and NOTHING else. OrganizationalUnit is not a versioned aggregate,
    // so there is no `expectedRowVersion` to send â€” and the body is
    // `additionalProperties: false`, so sending one would be a 400.
    expect(statusBodies).toEqual([{ status: 1 }, { status: 0 }])
    for (const body of statusBodies) {
      expect(typeof (body as { status: unknown }).status).toBe('number')
      expect(body).not.toHaveProperty('expectedRowVersion')
    }
    await waitFor(() => expect(listRequests).toBeGreaterThan(listRequestsBefore + 1))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(detailRequestsBefore + 1))
  })

  it('skips invalidation entirely while no scope is active', async () => {
    activeScope.key = undefined
    const unit = createOrganizationalUnit()
    const statusBodies: unknown[] = []

    server.use(
      http.put(`${API_BASE_URL}/organizational-units/${unit.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useSetOrganizationalUnitStatusMutation(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ orgUnitId: unit.id, status: 'Inactive' })
    })

    expect(statusBodies).toEqual([{ status: 1 }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
