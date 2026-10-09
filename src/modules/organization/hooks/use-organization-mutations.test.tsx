import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createOrganization } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  useCreateOrganizationMutation,
  useSetOrganizationStatusMutation,
  useUpdateOrganizationMutation,
} from './use-organization-mutations'
import { useOrganizationsQuery, useOrganizationQuery } from './use-organization-queries'

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

describe('organization mutation cache invalidation', () => {
  it('refetches both the list and the detail query after a create', async () => {
    const organization = createOrganization()
    let listRequests = 0
    let detailRequests = 0
    const createBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => {
        listRequests += 1
        return okPageJson([organization], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/organizations/${organization.id}`, () => {
        detailRequests += 1
        return okJson(organization)
      }),
      http.post(`${API_BASE_URL}/organizations`, async ({ request }) => {
        createBodies.push(await request.json())
        return okJson({ id: organization.id })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useOrganizationsQuery({ page: 1, pageSize: 10 }),
        detail: useOrganizationQuery(organization.id),
        create: useCreateOrganizationMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.name).toBe(organization.name))

    await act(async () => {
      await result.current.create.mutateAsync({ name: 'جهة جديدة', code: 'ORG-NEW' })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    // `POST /organizations` binds name and code only: no `status` (a new record
    // is Active by definition) and no concurrency token (nothing to guard).
    expect(createBodies).toEqual([{ name: 'جهة جديدة', code: 'ORG-NEW' }])
  })

  it('sends an update body of name alone and an integer status command body', async () => {
    const organization = createOrganization()
    const updateBodies: unknown[] = []
    const statusBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => okPageJson([organization])),
      http.get(`${API_BASE_URL}/organizations/${organization.id}`, () => okJson(organization)),
      http.put(`${API_BASE_URL}/organizations/${organization.id}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
      http.put(`${API_BASE_URL}/organizations/${organization.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        update: useUpdateOrganizationMutation(),
        setStatus: useSetOrganizationStatusMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.update.mutateAsync({
        organizationId: organization.id,
        request: { name: 'الهيئة المحدّثة' },
      })
    })
    await act(async () => {
      await result.current.setStatus.mutateAsync({
        organizationId: organization.id,
        status: 'Inactive',
      })
    })

    // `PUT /organizations/{id}` binds `name` and nothing else: `code` is
    // create-only, so a code rename is not expressible through this API.
    expect(updateBodies).toEqual([{ name: 'الهيئة المحدّثة' }])
    // The status command binds an INT ordinal. `{"status":"Inactive"}` is a
    // JSON binding failure on `[JsonRequired] int Status`, and so is omitting
    // the member entirely.
    expect(statusBodies).toEqual([{ status: 1 }])
    expect(typeof (statusBodies[0] as { status: unknown }).status).toBe('number')
  })

  it('skips invalidation entirely while no scope is active', async () => {
    activeScope.key = undefined
    const organization = createOrganization()
    const createBodies: unknown[] = []

    server.use(
      http.post(`${API_BASE_URL}/organizations`, async ({ request }) => {
        createBodies.push(await request.json())
        return okJson({ id: organization.id })
      }),
    )

    const { result } = renderHook(() => useCreateOrganizationMutation(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: 'جهة بلا نطاق', code: 'ORG-NS' })
    })

    // The write itself still reaches the server; only the cache sweep is
    // skipped, because there is no scope key to invalidate against.
    expect(createBodies).toEqual([{ name: 'جهة بلا نطاق', code: 'ORG-NS' }])
    expect(result.current.isSuccess).toBe(true)
  })
})
