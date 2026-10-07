import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { ApiPage } from '@/shared/api/api-contracts'
import type {
  Site,
  SiteCreateRequest,
  SiteUpdateRequest,
  SitePage,
  OrganizationalUnit,
  OrganizationalUnitCreateRequest,
  OrganizationalUnitUpdateRequest,
  OrganizationalUnitPage,
  Employee,
  EmployeeCreateRequest,
  EmployeeUpdateRequest,
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
import type { ResourceIdResponse } from '@/shared/api/api-contracts'

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

/**
 * Write shapes verified against the backend C# `RequestBody` records (txq4).
 *
 * Create and update are DELIBERATELY separate types, not one "upsert": the
 * update routes accept a strictly smaller body (`code`, `organizationId`,
 * `siteId`, `parentId`, `orgUnitId` and `employeeNumber` are all create-only)
 * and none of these three aggregates is versioned. A single upsert type is what
 * previously let the UI send `nameAr` plus a `rowVersion` no projection has.
 *
 * Return types follow `ResultExtensions`: a `Result<Guid>` handler answers
 * `{ id }` (`ResourceIdResponse`), and a plain `Result` handler answers an EMPTY
 * body. Declaring `Promise<Site>` for an update handed callers a phantom record
 * the server never sent.
 */
export interface OrganizationService {
  listSites: (query: ListSitesQuery) => Promise<SitePage>
  getSite: (siteId: string) => Promise<Site>
  createSite: (request: SiteCreateRequest) => Promise<ResourceIdResponse>
  updateSite: (siteId: string, request: SiteUpdateRequest) => Promise<void>
  listOrganizationalUnits: (query: ListOrganizationalUnitsQuery) => Promise<OrganizationalUnitPage>
  getOrganizationalUnit: (orgUnitId: string) => Promise<OrganizationalUnit>
  createOrganizationalUnit: (
    request: OrganizationalUnitCreateRequest,
  ) => Promise<ResourceIdResponse>
  updateOrganizationalUnit: (
    orgUnitId: string,
    request: OrganizationalUnitUpdateRequest,
  ) => Promise<void>
  listEmployees: (query: ListEmployeesQuery) => Promise<EmployeePage>
  getEmployee: (employeeId: string) => Promise<Employee>
  createEmployee: (request: EmployeeCreateRequest) => Promise<ResourceIdResponse>
  updateEmployee: (employeeId: string, request: EmployeeUpdateRequest) => Promise<void>
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
      return response
    },

    async createSite(request) {
      return await transport.request<ResourceIdResponse>({
        path: SITES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateSite(siteId, request) {
      await transport.requestEmpty({
        path: pathWithId(SITE_PATH, '{siteId}', siteId),
        method: 'PUT',
        body: request,
      })
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
      return response
    },

    async createOrganizationalUnit(request) {
      return await transport.request<ResourceIdResponse>({
        path: ORGANIZATIONAL_UNITS_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateOrganizationalUnit(orgUnitId, request) {
      await transport.requestEmpty({
        path: pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId),
        method: 'PUT',
        body: request,
      })
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
      return response
    },

    async createEmployee(request) {
      return await transport.request<ResourceIdResponse>({
        path: EMPLOYEES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateEmployee(employeeId, request) {
      await transport.requestEmpty({
        path: pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId),
        method: 'PUT',
        body: request,
      })
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
      return response
    },

    async createExternalParty(request) {
      const response = await transport.request<ExternalParty>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'POST',
        body: request,
      })
      return response
    },

    async updateExternalParty(externalPartyId, request) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'PUT',
        body: request,
      })
      return response
    },

    async deactivateExternalParty(externalPartyId) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(DEACTIVATE_EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'POST',
      })
      return response
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Never `{} as
// any` — that default is what made the first runtime list call throw. Replaced
// during tests by `setOrganizationService`.
let organizationService: OrganizationService = createOrganizationService(apiTransport)

export function setOrganizationService(transport: ApiTransport) {
  organizationService = createOrganizationService(transport)
}

export { organizationService }
