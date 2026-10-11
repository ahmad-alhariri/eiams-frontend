import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createSite } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useSitesQuery, useSiteQuery } from './use-organization-queries'
import {
  useCreateSiteMutation,
  useSetSiteStatusMutation,
  useUpdateSiteMutation,
} from './use-site-mutations'

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

describe('site mutation cache invalidation', () => {
  it('refetches both the list and the detail query after a create', async () => {
    const site = createSite()
    let listRequests = 0
    let detailRequests = 0
    const createBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => {
        listRequests += 1
        return okPageJson([site], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/sites/${site.id}`, () => {
        detailRequests += 1
        return okJson(site)
      }),
      http.post(`${API_BASE_URL}/sites`, async ({ request }) => {
        createBodies.push(await request.json())
        return okJson({ id: site.id })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useSitesQuery({ page: 1, pageSize: 10 }),
        detail: useSiteQuery(site.id),
        create: useCreateSiteMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.name).toBe(site.name))

    await act(async () => {
      await result.current.create.mutateAsync({
        organizationId: site.organizationId,
        name: 'Ù…ÙˆÙ‚Ø¹ Ø¬Ø¯ÙŠØ¯',
        code: 'SITE-NEW',
        location: null,
        governorateCode: null,
      })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    // `POST /sites` binds organizationId / name / code / location /
    // governorateCode. It binds no `status` and carries no concurrency token.
    expect(createBodies).toEqual([
      {
        organizationId: site.organizationId,
        name: 'Ù…ÙˆÙ‚Ø¹ Ø¬Ø¯ÙŠØ¯',
        code: 'SITE-NEW',
        location: null,
        governorateCode: null,
      },
    ])
  })

  it('sends an integer status command body in BOTH directions, with no version guard', async () => {
    const site = createSite()
    const updateBodies: unknown[] = []
    const statusBodies: unknown[] = []
    let listRequests = 0
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => {
        listRequests += 1
        return okPageJson([site])
      }),
      http.get(`${API_BASE_URL}/sites/${site.id}`, () => {
        detailRequests += 1
        return okJson(site)
      }),
      http.put(`${API_BASE_URL}/sites/${site.id}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
      http.put(`${API_BASE_URL}/sites/${site.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useSitesQuery({ page: 1, pageSize: 10 }),
        detail: useSiteQuery(site.id),
        update: useUpdateSiteMutation(),
        setStatus: useSetSiteStatusMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.name).toBe(site.name))

    await act(async () => {
      await result.current.update.mutateAsync({
        siteId: site.id,
        request: { name: 'Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ù…Ø­Ø¯Ù‘Ø«', location: null, governorateCode: null },
      })
    })

    const listRequestsBefore = listRequests
    const detailRequestsBefore = detailRequests

    // Deactivation then reactivation: the SAME route with the other ordinal, so
    // the direction comes from the status the row carries and nothing else about
    // the write changes.
    await act(async () => {
      await result.current.setStatus.mutateAsync({ siteId: site.id, status: 'Inactive' })
    })
    await act(async () => {
      await result.current.setStatus.mutateAsync({ siteId: site.id, status: 'Active' })
    })

    // `PUT /sites/{id}` binds name / location / governorateCode only: no `status`
    // (that is the separate command) and no version token.
    expect(updateBodies).toEqual([
      { name: 'Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ù…Ø­Ø¯Ù‘Ø«', location: null, governorateCode: null },
    ])
    // `[JsonRequired] int Status`: the ORDINAL, never the status name the read
    // served, and NOTHING else. Site is not versioned, so there is no
    // `expectedRowVersion` to send and the body is `additionalProperties: false`.
    expect(statusBodies).toEqual([{ status: 1 }, { status: 0 }])
    for (const body of statusBodies) {
      expect(typeof (body as { status: unknown }).status).toBe('number')
      expect(body).not.toHaveProperty('expectedRowVersion')
    }
    // Both writes swept the cache, so a reactivated row is what the screen shows.
    await waitFor(() => expect(listRequests).toBeGreaterThan(listRequestsBefore + 1))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(detailRequestsBefore + 1))
  })

  it('skips invalidation entirely while no scope is active', async () => {
    activeScope.key = undefined
    const site = createSite()
    const statusBodies: unknown[] = []

    server.use(
      http.put(`${API_BASE_URL}/sites/${site.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useSetSiteStatusMutation(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ siteId: site.id, status: 'Inactive' })
    })

    // The write itself still reaches the server; only the cache sweep is
    // skipped, because there is no scope key to invalidate against.
    expect(statusBodies).toEqual([{ status: 1 }])
    // `mutateAsync` resolving does not re-render synchronously: React Query
    // commits the success state in a microtask, so this has to be awaited
    // rather than read straight off `result.current`.
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
