import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import type {
  ListEmployeesQuery,
  ListExternalPartiesQuery,
  ListOrganizationalUnitsQuery,
  ListSitesQuery,
} from '@/modules/organization/types/organization.types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const ORGANIZATION_RESOURCE = 'organization'
const EMPTY_QUERY = {} as const

type OrganizationQueryOptions = {
  enabled?: boolean
}

export const organizationQueryKeys = {
  sites: (scope: ScopeCacheKey, query: ListSitesQuery) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'sites', query),
  site: (scope: ScopeCacheKey, siteId: string) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'sites', siteId),
  organizationalUnits: (scope: ScopeCacheKey, query: ListOrganizationalUnitsQuery) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'organizational-units', query),
  organizationalUnit: (scope: ScopeCacheKey, orgUnitId: string) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'organizational-units', orgUnitId),
  employees: (scope: ScopeCacheKey, query: ListEmployeesQuery) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'employees', query),
  employee: (scope: ScopeCacheKey, employeeId: string) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'employees', employeeId),
  externalParties: (scope: ScopeCacheKey, query: ListExternalPartiesQuery) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'external-parties', query),
  externalParty: (scope: ScopeCacheKey, externalPartyId: string) =>
    queryKeys.scoped(scope, ORGANIZATION_RESOURCE, 'external-parties', externalPartyId),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

export function useSitesQuery(
  query: ListSitesQuery = EMPTY_QUERY,
  options: OrganizationQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'sites', query)
        : organizationQueryKeys.sites(scope, query),
    queryFn: () => organizationService.listSites(query),
    enabled: scope !== undefined && (options.enabled ?? true),
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useSiteQuery(siteId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || siteId === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'sites', siteId)
        : organizationQueryKeys.site(scope, siteId),
    queryFn: () => organizationService.getSite(siteId ?? ''),
    enabled: scope !== undefined && siteId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useOrganizationalUnitsQuery(
  query: ListOrganizationalUnitsQuery = EMPTY_QUERY,
  options: OrganizationQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'organizational-units', query)
        : organizationQueryKeys.organizationalUnits(scope, query),
    queryFn: () => organizationService.listOrganizationalUnits(query),
    enabled: scope !== undefined && (options.enabled ?? true),
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useOrganizationalUnitQuery(orgUnitId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || orgUnitId === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'organizational-units', orgUnitId)
        : organizationQueryKeys.organizationalUnit(scope, orgUnitId),
    queryFn: () => organizationService.getOrganizationalUnit(orgUnitId ?? ''),
    enabled: scope !== undefined && orgUnitId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useEmployeesQuery(query: ListEmployeesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'employees', query)
        : organizationQueryKeys.employees(scope, query),
    queryFn: () => organizationService.listEmployees(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useEmployeeQuery(employeeId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || employeeId === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'employees', employeeId)
        : organizationQueryKeys.employee(scope, employeeId),
    queryFn: () => organizationService.getEmployee(employeeId ?? ''),
    enabled: scope !== undefined && employeeId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useExternalPartiesQuery(query: ListExternalPartiesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'external-parties', query)
        : organizationQueryKeys.externalParties(scope, query),
    queryFn: () => organizationService.listExternalParties(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useExternalPartyQuery(externalPartyId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || externalPartyId === undefined
        ? queryKeys.public(ORGANIZATION_RESOURCE, 'external-parties', externalPartyId)
        : organizationQueryKeys.externalParty(scope, externalPartyId),
    queryFn: () => organizationService.getExternalParty(externalPartyId ?? ''),
    enabled: scope !== undefined && externalPartyId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
