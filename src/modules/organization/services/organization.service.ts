import type { ApiTransport } from '@/shared/api/api-transport'
import type { ApiPage } from '@/shared/api/api-contracts'
import type {
  Site,
  SiteUpsertRequest,
  SitePage,
  OrganizationalUnit,
  OrganizationalUnitUpsertRequest,
  OrganizationalUnitPage,
  Employee,
  EmployeeUpsertRequest,
  EmployeePage,
  ExternalParty,
  ExternalPartyUpsertRequest,
  ExternalPartyPage,
  ListSitesQuery,
  ListOrganizationalUnitsQuery,
  ListEmployeesQuery,
  ListExternalPartiesQuery,
  PageMeta,
} from '@/modules/organization/types/organization.api-types'

const SITES_PATH = '/sites'
const SITE_PATH = '/sites/{siteId}'
const ORGANIZATIONAL_UNITS_PATH = '/organizational-units'
const ORGANIZATIONAL_UNIT_PATH = '/organizational-units/{orgUnitId}'
const EMPLOYEES_PATH = '/employees'
const EMPLOYEE_PATH = '/employees/{employeeId}'
const EXTERNAL_PARTIES_PATH = '/external-parties'
const EXTERNAL_PARTY_PATH = '/external-parties/{externalPartyId}'
const DEACTIVATE_EXTERNAL_PARTY_PATH = '/external-parties/{externalPartyId}/deactivate'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

/** Convert transport `ApiPage<T>` to module `XxxPage` with `meta: PageMeta`. */
function normalizePage<T>(apiPage: ApiPage<T>): { items: ReadonlyArray<T>; meta: PageMeta } {
  return {
    items: apiPage.items,
    meta: {
      page: apiPage.page,
      pageIndex: apiPage.page,
      pageSize: apiPage.pageSize,
      itemCount: apiPage.totalItems,
      totalItems: apiPage.totalItems,
      totalCount: apiPage.totalItems,
      totalPages: apiPage.totalPages,
      hasNextPage: apiPage.hasNextPage,
      hasPreviousPage: apiPage.hasPreviousPage,
    },
  }
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
  deactivateExternalParty: (externalPartyId: string) => Promise<ExternalParty>
}

export function createOrganizationService(transport: ApiTransport): OrganizationService {
  return {
    async listSites(query) {
      const page = await transport.requestPage<Site>({
        path: SITES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as SitePage
    },

    async getSite(siteId) {
      const response = await transport.request<Site>({
        path: pathWithId(SITE_PATH, '{siteId}', siteId),
        method: 'GET',
      })
      return response.data
    },

    async createSite(request) {
      const response = await transport.request<Site>({
        path: SITES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateSite(siteId, request) {
      const response = await transport.request<Site>({
        path: pathWithId(SITE_PATH, '{siteId}', siteId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listOrganizationalUnits(query) {
      const page = await transport.requestPage<OrganizationalUnit>({
        path: ORGANIZATIONAL_UNITS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as OrganizationalUnitPage
    },

    async getOrganizationalUnit(orgUnitId) {
      const response = await transport.request<OrganizationalUnit>({
        path: pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId),
        method: 'GET',
      })
      return response.data
    },

    async createOrganizationalUnit(request) {
      const response = await transport.request<OrganizationalUnit>({
        path: ORGANIZATIONAL_UNITS_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateOrganizationalUnit(orgUnitId, request) {
      const response = await transport.request<OrganizationalUnit>({
        path: pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listEmployees(query) {
      const page = await transport.requestPage<Employee>({
        path: EMPLOYEES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as EmployeePage
    },

    async getEmployee(employeeId) {
      const response = await transport.request<Employee>({
        path: pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId),
        method: 'GET',
      })
      return response.data
    },

    async createEmployee(request) {
      const response = await transport.request<Employee>({
        path: EMPLOYEES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateEmployee(employeeId, request) {
      const response = await transport.request<Employee>({
        path: pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listExternalParties(query) {
      const page = await transport.requestPage<ExternalParty>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return normalizePage(page) as ExternalPartyPage
    },

    async getExternalParty(externalPartyId) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'GET',
      })
      return response.data
    },

    async createExternalParty(request) {
      const response = await transport.request<ExternalParty>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateExternalParty(externalPartyId, request) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async deactivateExternalParty(externalPartyId) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(DEACTIVATE_EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'POST',
      })
      return response.data
    },
  }
}

// Lazy singleton — replaced during tests by `setOrganizationService`.
let organizationService: OrganizationService = createOrganizationService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function setOrganizationService(transport: ApiTransport) {
  organizationService = createOrganizationService(transport)
}

export { organizationService }
