import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import type {
  Site,
  SiteCreateRequest,
  SiteUpdateRequest,
  SetSiteStatusRequest,
  SitePage,
  Organization,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  SetOrganizationStatusRequest,
  OrganizationPage,
  ListOrganizationsQuery,
  OrganizationalUnit,
  OrganizationalUnitCreateRequest,
  OrganizationalUnitUpdateRequest,
  SetOrganizationalUnitStatusRequest,
  OrganizationalUnitPage,
  Employee,
  EmployeeCreateRequest,
  EmployeeUpdateRequest,
  SetEmployeeStatusRequest,
  EmployeePage,
  ExternalParty,
  CreateExternalPartyRequest,
  UpdateExternalPartyRequest,
  SetExternalPartyStatusRequest,
  ExternalPartyPage,
  ListSitesQuery,
  ListOrganizationalUnitsQuery,
  ListEmployeesQuery,
  ListExternalPartiesQuery,
} from '@/modules/organization/types/organization.api-types'
import type { ResourceIdResponse } from '@/shared/api/api-contracts'

const ORGANIZATIONS_PATH = '/organizations'
const ORGANIZATION_PATH = '/organizations/{organizationId}'
const SITES_PATH = '/sites'
const SITE_PATH = '/sites/{siteId}'
const ORGANIZATIONAL_UNITS_PATH = '/organizational-units'
const ORGANIZATIONAL_UNIT_PATH = '/organizational-units/{orgUnitId}'
const EMPLOYEES_PATH = '/employees'
const EMPLOYEE_PATH = '/employees/{employeeId}'
const EXTERNAL_PARTIES_PATH = '/external-parties'
const EXTERNAL_PARTY_PATH = '/external-parties/{externalPartyId}'

/** The query shape `ApiRequest.query` accepts. */
type WireQuery = Readonly<Record<string, string | number | boolean | undefined>>

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

/**
 * THE PAGINATION BOUNDARY, and it is deliberately an IDENTITY.
 *
 * The table controls in this app are one-based (`useServerPagination` starts at
 * 1) and the wire is one-based (`PaginationQueryParameters.Page` is
 * `[Range(1, 21474836)]`, default 1). So there is nothing to convert — the
 * page crosses unchanged, and `toWireOneBasedPaginationParams` only clamps it
 * into the range the server accepts.
 *
 * The subtraction that used to live in each list screen (`page: currentPage - 1`)
 * was therefore never a conversion; it was a bug wearing one. It put `page=0`
 * on the wire for the first page of every list, and the backend answers that
 * with 400 `REQUEST_VALIDATION_FAILED`
 * (`details.Page = ["The field Page must be between 1 and 21474836."]`) — which
 * is why the organization directories rendered a load-failure card instead of
 * data. Clamping here also bounds `pageSize` to the backend's `[1, 100]`, so
 * the `pageSize: 200` reference lists that used to ask for 200 rows can no
 * longer be written; the screens that depend on those lists say so in Arabic
 * when the directory is longer than one page (see `ReferenceLimitNote`).
 *
 * Every list query is built by the four builders below rather than by casting
 * the caller's object. The cast these replaced is why `pageIndex` — a key that
 * is not in `ListExternalPartiesQuery` and that ASP.NET silently discards,
 * pinning every request to page 1 — survived type-checking and shipped.
 */
function sitesQuery(query: ListSitesQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.organizationId === undefined ? {} : { organizationId: query.organizationId }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function organizationalUnitsQuery(query: ListOrganizationalUnitsQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.parentId === undefined ? {} : { parentId: query.parentId }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function employeesQuery(query: ListEmployeesQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.orgUnitId === undefined ? {} : { orgUnitId: query.orgUnitId }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function externalPartiesQuery(query: ListExternalPartiesQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function organizationsQuery(query: ListOrganizationsQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.status === undefined ? {} : { status: query.status }),
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
  listOrganizations: (query: ListOrganizationsQuery) => Promise<OrganizationPage>
  getOrganization: (organizationId: string) => Promise<Organization>
  createOrganization: (request: CreateOrganizationRequest) => Promise<ResourceIdResponse>
  updateOrganization: (organizationId: string, request: UpdateOrganizationRequest) => Promise<void>
  setOrganizationStatus: (
    organizationId: string,
    request: SetOrganizationStatusRequest,
  ) => Promise<void>
  listSites: (query: ListSitesQuery) => Promise<SitePage>
  getSite: (siteId: string) => Promise<Site>
  createSite: (request: SiteCreateRequest) => Promise<ResourceIdResponse>
  updateSite: (siteId: string, request: SiteUpdateRequest) => Promise<void>
  setSiteStatus: (siteId: string, request: SetSiteStatusRequest) => Promise<void>
  listOrganizationalUnits: (query: ListOrganizationalUnitsQuery) => Promise<OrganizationalUnitPage>
  getOrganizationalUnit: (orgUnitId: string) => Promise<OrganizationalUnit>
  createOrganizationalUnit: (
    request: OrganizationalUnitCreateRequest,
  ) => Promise<ResourceIdResponse>
  updateOrganizationalUnit: (
    orgUnitId: string,
    request: OrganizationalUnitUpdateRequest,
  ) => Promise<void>
  setOrganizationalUnitStatus: (
    orgUnitId: string,
    request: SetOrganizationalUnitStatusRequest,
  ) => Promise<void>
  listEmployees: (query: ListEmployeesQuery) => Promise<EmployeePage>
  getEmployee: (employeeId: string) => Promise<Employee>
  createEmployee: (request: EmployeeCreateRequest) => Promise<ResourceIdResponse>
  updateEmployee: (employeeId: string, request: EmployeeUpdateRequest) => Promise<void>
  setEmployeeStatus: (employeeId: string, request: SetEmployeeStatusRequest) => Promise<void>
  listExternalParties: (query: ListExternalPartiesQuery) => Promise<ExternalPartyPage>
  getExternalParty: (externalPartyId: string) => Promise<ExternalParty>
  createExternalParty: (request: CreateExternalPartyRequest) => Promise<ResourceIdResponse>
  updateExternalParty: (
    externalPartyId: string,
    request: UpdateExternalPartyRequest,
  ) => Promise<void>
  setExternalPartyStatus: (
    externalPartyId: string,
    request: SetExternalPartyStatusRequest,
  ) => Promise<void>
}

export function createOrganizationService(transport: ApiTransport): OrganizationService {
  return {
    async listOrganizations(query) {
      return await transport.requestPage<Organization>({
        path: ORGANIZATIONS_PATH,
        method: 'GET',
        query: organizationsQuery(query),
      })
    },

    async getOrganization(organizationId) {
      const response = await transport.request<Organization>({
        path: pathWithId(ORGANIZATION_PATH, '{organizationId}', organizationId),
        method: 'GET',
      })
      return response
    },

    async createOrganization(request) {
      return await transport.request<ResourceIdResponse>({
        path: ORGANIZATIONS_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateOrganization(organizationId, request) {
      await transport.requestEmpty({
        path: pathWithId(ORGANIZATION_PATH, '{organizationId}', organizationId),
        method: 'PUT',
        body: request,
      })
    },

    async setOrganizationStatus(organizationId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(ORGANIZATION_PATH, '{organizationId}', organizationId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listSites(query) {
      return await transport.requestPage<Site>({
        path: SITES_PATH,
        method: 'GET',
        query: sitesQuery(query),
      })
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

    async setSiteStatus(siteId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(SITE_PATH, '{siteId}', siteId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listOrganizationalUnits(query) {
      return await transport.requestPage<OrganizationalUnit>({
        path: ORGANIZATIONAL_UNITS_PATH,
        method: 'GET',
        query: organizationalUnitsQuery(query),
      })
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

    async setOrganizationalUnitStatus(orgUnitId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(ORGANIZATIONAL_UNIT_PATH, '{orgUnitId}', orgUnitId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listEmployees(query) {
      return await transport.requestPage<Employee>({
        path: EMPLOYEES_PATH,
        method: 'GET',
        query: employeesQuery(query),
      })
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

    async setEmployeeStatus(employeeId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(EMPLOYEE_PATH, '{employeeId}', employeeId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listExternalParties(query) {
      return await transport.requestPage<ExternalParty>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'GET',
        query: externalPartiesQuery(query),
      })
    },

    async getExternalParty(externalPartyId) {
      const response = await transport.request<ExternalParty>({
        path: pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'GET',
      })
      return response
    },

    async createExternalParty(request) {
      return await transport.request<ResourceIdResponse>({
        path: EXTERNAL_PARTIES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateExternalParty(externalPartyId, request) {
      await transport.requestEmpty({
        path: pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId),
        method: 'PUT',
        body: request,
      })
    },

    async setExternalPartyStatus(externalPartyId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(EXTERNAL_PARTY_PATH, '{externalPartyId}', externalPartyId)}/status`,
        method: 'PUT',
        body: request,
      })
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
