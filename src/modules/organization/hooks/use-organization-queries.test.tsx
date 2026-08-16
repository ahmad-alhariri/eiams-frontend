import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createEmployee,
  createExternalParty,
  createOrganizationalUnit,
  createPage,
  createSite,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  organizationQueryKeys,
  useEmployeeQuery,
  useEmployeesQuery,
  useExternalPartiesQuery,
  useExternalPartyQuery,
  useOrganizationalUnitQuery,
  useOrganizationalUnitsQuery,
  useSiteQuery,
  useSitesQuery,
} from './use-organization-queries'

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

describe('organization query hooks', () => {
  it('reads a scoped, master-data sites query and preserves server pagination filters', async () => {
    const site = createSite()
    let search: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        search = new URL(request.url).searchParams.get('search')
        return HttpResponse.json(createPage([site]))
      }),
    )

    const query = { pageIndex: 3, pageSize: 10, search: 'دمشق' }
    const { result } = renderHook(() => useSitesQuery(query), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toEqual([site])
    expect(search).toBe('دمشق')
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0)
  })

  it('keeps site list and detail cache entries distinct inside the active scope', () => {
    const scope = { kind: 'enterprise' as const }
    const query = { pageIndex: 1, search: 'دمشق' }

    expect(organizationQueryKeys.sites(scope, query)).toEqual([
      'scoped',
      'enterprise',
      null,
      'organization',
      'sites',
      query,
    ])
    expect(organizationQueryKeys.site(scope, 'site-1')).toEqual([
      'scoped',
      'enterprise',
      null,
      'organization',
      'sites',
      'site-1',
    ])
  })

  it('reads scoped organization-unit, employee, and external-party list and detail resources', async () => {
    const unit = createOrganizationalUnit()
    const employee = createEmployee()
    const externalParty = createExternalParty()

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => HttpResponse.json(createPage([unit]))),
      http.get(`${API_BASE_URL}/organizational-units/${unit.orgUnitId}`, () =>
        HttpResponse.json(unit),
      ),
      http.get(`${API_BASE_URL}/employees`, () => HttpResponse.json(createPage([employee]))),
      http.get(`${API_BASE_URL}/employees/${employee.employeeId}`, () =>
        HttpResponse.json(employee),
      ),
      http.get(`${API_BASE_URL}/external-parties`, () =>
        HttpResponse.json(createPage([externalParty])),
      ),
      http.get(`${API_BASE_URL}/external-parties/${externalParty.externalPartyId}`, () =>
        HttpResponse.json(externalParty),
      ),
    )

    const unitsList = renderHook(() => useOrganizationalUnitsQuery({ siteId: unit.siteId }), {
      wrapper: createWrapper(),
    })
    const unitDetail = renderHook(() => useOrganizationalUnitQuery(unit.orgUnitId), {
      wrapper: createWrapper(),
    })
    const employeesList = renderHook(() => useEmployeesQuery({ siteId: unit.siteId }), {
      wrapper: createWrapper(),
    })
    const employeeDetail = renderHook(() => useEmployeeQuery(employee.employeeId), {
      wrapper: createWrapper(),
    })
    const externalPartiesList = renderHook(() => useExternalPartiesQuery({ search: 'خارجي' }), {
      wrapper: createWrapper(),
    })
    const externalPartyDetail = renderHook(
      () => useExternalPartyQuery(externalParty.externalPartyId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(unitsList.result.current.isSuccess).toBe(true)
      expect(unitDetail.result.current.isSuccess).toBe(true)
      expect(employeesList.result.current.isSuccess).toBe(true)
      expect(employeeDetail.result.current.isSuccess).toBe(true)
      expect(externalPartiesList.result.current.isSuccess).toBe(true)
      expect(externalPartyDetail.result.current.isSuccess).toBe(true)
    })

    expect(unitsList.result.current.data?.items).toEqual([unit])
    expect(unitDetail.result.current.data).toEqual(unit)
    expect(employeesList.result.current.data?.items).toEqual([employee])
    expect(employeeDetail.result.current.data).toEqual(employee)
    expect(externalPartiesList.result.current.data?.items).toEqual([externalParty])
    expect(externalPartyDetail.result.current.data).toEqual(externalParty)
  })

  it('disables protected organization queries until the server selects an active scope', async () => {
    activeScope.key = undefined
    let requestCount = 0

    server.use(
      http.get(`${API_BASE_URL}/employees`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createEmployee()]))
      }),
    )

    const { result } = renderHook(() => useEmployeesQuery({ search: 'موظف' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
    expect(requestCount).toBe(0)
  })

  it('reads a scoped site detail resource', async () => {
    const site = createSite()

    server.use(http.get(`${API_BASE_URL}/sites/${site.siteId}`, () => HttpResponse.json(site)))

    const { result } = renderHook(() => useSiteQuery(site.siteId), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(site)
  })
})
