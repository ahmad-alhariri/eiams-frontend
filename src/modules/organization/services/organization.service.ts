import type { AxiosInstance, AxiosRequestConfig } from 'axios'

import type {
  Employee,
  EmployeePage,
  EmployeeUpsertRequest,
  ExternalParty,
  ExternalPartyPage,
  ExternalPartyUpsertRequest,
  OrganizationalUnit,
  OrganizationalUnitPage,
  OrganizationalUnitUpsertRequest,
  paths,
  Site,
  SitePage,
  SiteUpsertRequest,
} from '@/shared/types/generated/eiams-v1'
import { apiClient } from '@/shared/services/api.client'
import type {
  ListEmployeesQuery,
  ListExternalPartiesQuery,
  ListOrganizationalUnitsQuery,
  ListSitesQuery,
} from '@/modules/organization/types/organization.types'

const SITES_PATH = '/sites' satisfies keyof paths
const SITE_PATH = '/sites/{siteId}' satisfies keyof paths
const ORGANIZATIONAL_UNITS_PATH = '/organizational-units' satisfies keyof paths
const ORGANIZATIONAL_UNIT_PATH = '/organizational-units/{orgUnitId}' satisfies keyof paths
const EMPLOYEES_PATH = '/employees' satisfies keyof paths
const EMPLOYEE_PATH = '/employees/{employeeId}' satisfies keyof paths
const EXTERNAL_PARTIES_PATH = '/external-parties' satisfies keyof paths
const EXTERNAL_PARTY_PATH = '/external-parties/{externalPartyId}' satisfies keyof paths
const DEACTIVATE_EXTERNAL_PARTY_PATH =
  '/external-parties/{externalPartyId}/deactivate' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface OrganizationService {
  listSites: (query: ListSitesQuery) => Promise<SitePage>
  getSite: (siteId: string) => Promise<Site>
  createSite: (request: SiteUpsertRequest) => Promise<Site>
  updateSite: (siteId: string, request: SiteUpsertRequest) => Promise<Site>
  listOrganizationalUnits: (query: ListOrganizationalUnitsQuery) => Promise<OrganizationalUnitPage>
  getOrganizationalUnit: (orgUnitId: string) => Promise<OrganizationalUnit>
  createOrganizationalUnit: (
    request: OrganizationalUnitUpsertRequest,
  ) => Promise<OrganizationalUnit>
  updateOrganizationalUnit: (
    orgUnitId: string,
    request: OrganizationalUnitUpsertRequest,
  ) => Promise<OrganizationalUnit>
  listEmployees: (query: ListEmployeesQuery) => Promise<EmployeePage>
  getEmployee: (employeeId: string) => Promise<Employee>
  createEmployee: (request: EmployeeUpsertRequest) => Promise<Employee>
  updateEmployee: (employeeId: string, request: EmployeeUpsertRequest) => Promise<Employee>
  listExternalParties: (query: ListExternalPartiesQuery) => Promise<ExternalPartyPage>
  getExternalParty: (externalPartyId: string) => Promise<ExternalParty>
  createExternalParty: (request: ExternalPartyUpsertRequest) => Promise<ExternalParty>
  updateExternalParty: (
    externalPartyId: string,
    request: ExternalPartyUpsertRequest,
  ) => Promise<ExternalParty>
  deactivateExternalParty: (
    externalPartyId: string,
    config: AxiosRequestConfig,
  ) => Promise<ExternalParty>
}

/**
 * Contract-only organization transport for a single Axios boundary.
 *
 * The caller supplies idempotency configuration for deactivation so the
 * interactive mutation can retain and explicitly reuse its request key.
 */
export function createOrganizationService(client: AxiosInstance): OrganizationService {
  return {
    async listSites(query) {
      const response = await client.get<SitePage>(SITES_PATH, { params: query })
      return response.data
    },
    async getSite(siteId) {
      const response = await client.get<Site>(pathWithId(SITE_PATH, '{siteId}', siteId))
      return response.data
    },
    async createSite(request) {
      const response = await client.post<Site>(SITES_PATH, request)
      return response.data
    },
    async updateSite(siteId, request) {
      const response = await client.put<Site>(pathWithId(SITE_PATH, '{siteId}', siteId), request)
      return response.data
    },
    async listOrganizationalUnits(query) {
      const response = await client.get<OrganizationalUnitPage>(ORGANIZATIONAL_UNITS_PATH, {
        params: query,
      })
      return response.data
    },
    async getOrganizationalUnit(orgUnitId) {
      const response = await client.get<OrganizationalUnit>(
        pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId),
      )
      return response.data
    },
    async createOrganizationalUnit(request) {
      const response = await client.post<OrganizationalUnit>(ORGANIZATIONAL_UNITS_PATH, request)
      return response.data
    },
    async updateOrganizationalUnit(orgUnitId, request) {
      const response = await client.put<OrganizationalUnit>(
        pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId),
        request,
      )
      return response.data
    },
    async listEmployees(query) {
      const response = await client.get<EmployeePage>(EMPLOYEES_PATH, { params: query })
      return response.data
    },
    async getEmployee(employeeId) {
      const response = await client.get<Employee>(
        pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId),
      )
      return response.data
    },
    async createEmployee(request) {
      const response = await client.post<Employee>(EMPLOYEES_PATH, request)
      return response.data
    },
    async updateEmployee(employeeId, request) {
      const response = await client.put<Employee>(
        pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId),
        request,
      )
      return response.data
    },
    async listExternalParties(query) {
      const response = await client.get<ExternalPartyPage>(EXTERNAL_PARTIES_PATH, { params: query })
      return response.data
    },
    async getExternalParty(externalPartyId) {
      const response = await client.get<ExternalParty>(
        pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
      )
      return response.data
    },
    async createExternalParty(request) {
      const response = await client.post<ExternalParty>(EXTERNAL_PARTIES_PATH, request)
      return response.data
    },
    async updateExternalParty(externalPartyId, request) {
      const response = await client.put<ExternalParty>(
        pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        request,
      )
      return response.data
    },
    async deactivateExternalParty(externalPartyId, config) {
      const response = await client.post<ExternalParty>(
        pathWithId(DEACTIVATE_EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        undefined,
        config,
      )
      return response.data
    },
  }
}

export const organizationService = createOrganizationService(apiClient)
