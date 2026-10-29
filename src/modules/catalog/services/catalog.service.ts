import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import type {
  UnitOfMeasure,
  CreateUnitOfMeasureRequest,
  UpdateUnitOfMeasureRequest,
  SetUnitOfMeasureStatusRequest,
  UnitOfMeasurePage,
  ListUnitsOfMeasureQuery,
  MaterialDomain,
  CreateMaterialDomainRequest,
  UpdateMaterialDomainRequest,
  SetMaterialDomainStatusRequest,
  MaterialDomainPage,
  ListMaterialDomainsQuery,
  MaterialCategory,
  CreateMaterialCategoryRequest,
  UpdateMaterialCategoryRequest,
  MoveMaterialCategoryRequest,
  SetMaterialCategoryStatusRequest,
  MaterialCategoryPage,
  ListMaterialCategoriesQuery,
  MaterialFamily,
  CreateMaterialFamilyRequest,
  UpdateMaterialFamilyRequest,
  SetMaterialFamilyStatusRequest,
  MaterialFamilyPage,
  ListMaterialFamiliesQuery,
  Material,
  CreateMaterialRequest,
  UpdateMaterialRequest,
  SetMaterialStatusRequest,
  MaterialPage,
  ListMaterialsQuery,
  MaterialUnitConversion,
  CreateMaterialUnitConversionRequest,
  UpdateMaterialUnitConversionRequest,
  MaterialUnitConversionPage,
  ListMaterialUnitConversionsQuery,
} from '@/modules/catalog/types/catalog.api-types'
import type { ResourceIdResponse } from '@/shared/api/api-contracts'
import { pathWithId } from '@/shared/services/api-path'

// Real routes (the transport prefixes `/api/v1`). The 404 traps this file used
// to carry: `/catalog/material-domains`, `/catalog/material-categories` and
// `/catalog/material-families` NEVER existed — the real collections are
// `/catalog/domains`, `/catalog/categories` and `/catalog/families`, exactly as
// the backend's MaterialDomains/MaterialCategories/MaterialFamilies controllers
// declare them. Status and move sub-routes follow each controller's own
// `[HttpPut("{id}/status")]` / `[HttpPut("{id}/parent")]` attributes.
const UNITS_OF_MEASURE_PATH = '/catalog/units-of-measure'
const UNIT_OF_MEASURE_PATH = '/catalog/units-of-measure/{unitId}'
const MATERIAL_DOMAINS_PATH = '/catalog/domains'
const MATERIAL_DOMAIN_PATH = '/catalog/domains/{materialDomainId}'
const MATERIAL_CATEGORIES_PATH = '/catalog/categories'
const MATERIAL_CATEGORY_PATH = '/catalog/categories/{materialCategoryId}'
const MATERIAL_CATEGORY_PARENT_PATH = '/catalog/categories/{materialCategoryId}/parent'
const MATERIAL_FAMILIES_PATH = '/catalog/families'
const MATERIAL_FAMILY_PATH = '/catalog/families/{materialFamilyId}'
const MATERIALS_PATH = '/catalog/materials'
const MATERIAL_PATH = '/catalog/materials/{materialId}'
const MATERIAL_UNIT_CONVERSIONS_PATH = '/catalog/materials/{materialId}/unit-conversions'
const MATERIAL_UNIT_CONVERSION_PATH =
  '/catalog/materials/{materialId}/unit-conversions/{materialUnitConversionId}'

/** The query shape `ApiRequest.query` accepts. */
type WireQuery = Readonly<Record<string, string | number | boolean | undefined>>

/**
 * THE PAGINATION BOUNDARY, and it is deliberately an IDENTITY plus a clamp —
 * same reasoning as `organization.service.ts`.
 *
 * The table controls in this app are one-based (`useServerPagination` starts
 * from 1) and the wire is one-based (`PaginationQueryParameters.Page` is
 * `[Range(1, 21474836)]`, default 1), so the page crosses unchanged and
 * `toWireOneBasedPaginationParams` only clamps it into the accepted range
 * (`pageSize` into `[1, 100]`). The subtraction that used to live at call
 * sites (`page: currentPage - 1`) produced `page=0`, which the backend answers
 * with 400 `REQUEST_VALIDATION_FAILED`.
 *
 * Every list query is built by the six builders below rather than by casting
 * the caller's object. The casts these replaced
 * (`query as Record<string, string | number | boolean | undefined>`) are how a
 * parameter no catalog list binds reached the wire anyway, and how the page
 * wrapper got its `as unknown as XPage` companion. Each builder now declares
 * exactly the filters its contract route accepts (materials, for instance,
 * carries a typed `search`).
 */

/** Binds no filter at all — pagination only. */
function unitsOfMeasureQuery(query: ListUnitsOfMeasureQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
  }
}

function materialDomainsQuery(query: ListMaterialDomainsQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function materialCategoriesQuery(query: ListMaterialCategoriesQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.materialDomainId === undefined ? {} : { materialDomainId: query.materialDomainId }),
    ...(query.parentCategoryId === undefined ? {} : { parentCategoryId: query.parentCategoryId }),
    ...(query.rootOnly === undefined ? {} : { rootOnly: query.rootOnly }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function materialFamiliesQuery(query: ListMaterialFamiliesQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

function materialsQuery(query: ListMaterialsQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.familyId === undefined ? {} : { familyId: query.familyId }),
    ...(query.materialDomainId === undefined ? {} : { materialDomainId: query.materialDomainId }),
    ...(query.status === undefined ? {} : { status: query.status }),
  }
}

/** Binds no filter — the material is in the path; pagination only. */
function materialUnitConversionsQuery(query: ListMaterialUnitConversionsQuery): WireQuery {
  return {
    ...toWireOneBasedPaginationParams(query),
  }
}

/**
 * Write shapes verified against the backend C# controllers (`whhu.15` S1).
 *
 * Create and update are DELIBERATELY separate types, not one "upsert": the
 * update routes accept strictly smaller bodies (domains drop `code`,
 * categories drop `materialDomainId`/`parentCategoryId`, families drop
 * `categoryId`, materials drop `familyId`/`baseUnitId`) and only Material is
 * versioned. A single upsert type is what previously let the UI send
 * `rowVersion` — a field no catalog entity except Material's
 * `catalogVersion` equivalent even has — on every material save, which the
 * backend rejects with 400 `REQUEST_VALIDATION_FAILED`.
 *
 * Return types follow the controllers: a `Result<Guid>` handler answers
 * `{ id }` (`ResourceIdResponse`, HTTP 200 — never 201), and a plain `Result`
 * handler answers an EMPTY body (`requestEmpty`). Declaring `Promise<Material>`
 * for an update handed callers a phantom record the server never sent.
 *
 * Category re-parenting is its own command (`PUT .../parent`), and the
 * unit-conversion lifecycle ends in DELETE — there is no conversion status
 * command because no catalog unit-conversion controller serves one.
 */
export interface CatalogService {
  listUnitsOfMeasure: (query: ListUnitsOfMeasureQuery) => Promise<UnitOfMeasurePage>
  getUnitOfMeasure: (unitId: string) => Promise<UnitOfMeasure>
  createUnitOfMeasure: (request: CreateUnitOfMeasureRequest) => Promise<ResourceIdResponse>
  updateUnitOfMeasure: (unitId: string, request: UpdateUnitOfMeasureRequest) => Promise<void>
  setUnitOfMeasureStatus: (unitId: string, request: SetUnitOfMeasureStatusRequest) => Promise<void>

  listMaterialDomains: (query: ListMaterialDomainsQuery) => Promise<MaterialDomainPage>
  getMaterialDomain: (materialDomainId: string) => Promise<MaterialDomain>
  createMaterialDomain: (request: CreateMaterialDomainRequest) => Promise<ResourceIdResponse>
  updateMaterialDomain: (
    materialDomainId: string,
    request: UpdateMaterialDomainRequest,
  ) => Promise<void>
  setMaterialDomainStatus: (
    materialDomainId: string,
    request: SetMaterialDomainStatusRequest,
  ) => Promise<void>

  listMaterialCategories: (query: ListMaterialCategoriesQuery) => Promise<MaterialCategoryPage>
  getMaterialCategory: (materialCategoryId: string) => Promise<MaterialCategory>
  createMaterialCategory: (request: CreateMaterialCategoryRequest) => Promise<ResourceIdResponse>
  updateMaterialCategory: (
    materialCategoryId: string,
    request: UpdateMaterialCategoryRequest,
  ) => Promise<void>
  moveMaterialCategory: (
    materialCategoryId: string,
    request: MoveMaterialCategoryRequest,
  ) => Promise<void>
  setMaterialCategoryStatus: (
    materialCategoryId: string,
    request: SetMaterialCategoryStatusRequest,
  ) => Promise<void>

  listMaterialFamilies: (query: ListMaterialFamiliesQuery) => Promise<MaterialFamilyPage>
  getMaterialFamily: (materialFamilyId: string) => Promise<MaterialFamily>
  createMaterialFamily: (request: CreateMaterialFamilyRequest) => Promise<ResourceIdResponse>
  updateMaterialFamily: (
    materialFamilyId: string,
    request: UpdateMaterialFamilyRequest,
  ) => Promise<void>
  setMaterialFamilyStatus: (
    materialFamilyId: string,
    request: SetMaterialFamilyStatusRequest,
  ) => Promise<void>

  listMaterials: (query: ListMaterialsQuery) => Promise<MaterialPage>
  getMaterial: (materialId: string) => Promise<Material>
  createMaterial: (request: CreateMaterialRequest) => Promise<ResourceIdResponse>
  updateMaterial: (materialId: string, request: UpdateMaterialRequest) => Promise<void>
  setMaterialStatus: (materialId: string, request: SetMaterialStatusRequest) => Promise<void>

  listMaterialUnitConversions: (
    materialId: string,
    query: ListMaterialUnitConversionsQuery,
  ) => Promise<MaterialUnitConversionPage>
  getMaterialUnitConversion: (
    materialId: string,
    materialUnitConversionId: string,
  ) => Promise<MaterialUnitConversion>
  createMaterialUnitConversion: (
    materialId: string,
    request: CreateMaterialUnitConversionRequest,
  ) => Promise<ResourceIdResponse>
  updateMaterialUnitConversion: (
    materialId: string,
    materialUnitConversionId: string,
    request: UpdateMaterialUnitConversionRequest,
  ) => Promise<void>
  removeMaterialUnitConversion: (
    materialId: string,
    materialUnitConversionId: string,
  ) => Promise<void>
}

export function createCatalogService(transport: ApiTransport): CatalogService {
  return {
    async listUnitsOfMeasure(query) {
      return await transport.requestPage<UnitOfMeasure>({
        path: UNITS_OF_MEASURE_PATH,
        method: 'GET',
        query: unitsOfMeasureQuery(query),
      })
    },

    async getUnitOfMeasure(unitId) {
      const response = await transport.request<UnitOfMeasure>({
        path: pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
        method: 'GET',
      })
      return response
    },

    async createUnitOfMeasure(request) {
      return await transport.request<ResourceIdResponse>({
        path: UNITS_OF_MEASURE_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateUnitOfMeasure(unitId, request) {
      await transport.requestEmpty({
        path: pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
        method: 'PUT',
        body: request,
      })
    },

    async setUnitOfMeasureStatus(unitId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listMaterialDomains(query) {
      return await transport.requestPage<MaterialDomain>({
        path: MATERIAL_DOMAINS_PATH,
        method: 'GET',
        query: materialDomainsQuery(query),
      })
    },

    async getMaterialDomain(materialDomainId) {
      const response = await transport.request<MaterialDomain>({
        path: pathWithId(MATERIAL_DOMAIN_PATH, '{materialDomainId}', materialDomainId),
        method: 'GET',
      })
      return response
    },

    async createMaterialDomain(request) {
      return await transport.request<ResourceIdResponse>({
        path: MATERIAL_DOMAINS_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateMaterialDomain(materialDomainId, request) {
      await transport.requestEmpty({
        path: pathWithId(MATERIAL_DOMAIN_PATH, '{materialDomainId}', materialDomainId),
        method: 'PUT',
        body: request,
      })
    },

    async setMaterialDomainStatus(materialDomainId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(MATERIAL_DOMAIN_PATH, '{materialDomainId}', materialDomainId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listMaterialCategories(query) {
      return await transport.requestPage<MaterialCategory>({
        path: MATERIAL_CATEGORIES_PATH,
        method: 'GET',
        query: materialCategoriesQuery(query),
      })
    },

    async getMaterialCategory(materialCategoryId) {
      const response = await transport.request<MaterialCategory>({
        path: pathWithId(MATERIAL_CATEGORY_PATH, '{materialCategoryId}', materialCategoryId),
        method: 'GET',
      })
      return response
    },

    async createMaterialCategory(request) {
      return await transport.request<ResourceIdResponse>({
        path: MATERIAL_CATEGORIES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateMaterialCategory(materialCategoryId, request) {
      await transport.requestEmpty({
        path: pathWithId(MATERIAL_CATEGORY_PATH, '{materialCategoryId}', materialCategoryId),
        method: 'PUT',
        body: request,
      })
    },

    async moveMaterialCategory(materialCategoryId, request) {
      await transport.requestEmpty({
        path: pathWithId(MATERIAL_CATEGORY_PARENT_PATH, '{materialCategoryId}', materialCategoryId),
        method: 'PUT',
        body: request,
      })
    },

    async setMaterialCategoryStatus(materialCategoryId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(MATERIAL_CATEGORY_PATH, '{materialCategoryId}', materialCategoryId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listMaterialFamilies(query) {
      return await transport.requestPage<MaterialFamily>({
        path: MATERIAL_FAMILIES_PATH,
        method: 'GET',
        query: materialFamiliesQuery(query),
      })
    },

    async getMaterialFamily(materialFamilyId) {
      const response = await transport.request<MaterialFamily>({
        path: pathWithId(MATERIAL_FAMILY_PATH, '{materialFamilyId}', materialFamilyId),
        method: 'GET',
      })
      return response
    },

    async createMaterialFamily(request) {
      return await transport.request<ResourceIdResponse>({
        path: MATERIAL_FAMILIES_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateMaterialFamily(materialFamilyId, request) {
      await transport.requestEmpty({
        path: pathWithId(MATERIAL_FAMILY_PATH, '{materialFamilyId}', materialFamilyId),
        method: 'PUT',
        body: request,
      })
    },

    async setMaterialFamilyStatus(materialFamilyId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(MATERIAL_FAMILY_PATH, '{materialFamilyId}', materialFamilyId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listMaterials(query) {
      return await transport.requestPage<Material>({
        path: MATERIALS_PATH,
        method: 'GET',
        query: materialsQuery(query),
      })
    },

    async getMaterial(materialId) {
      const response = await transport.request<Material>({
        path: pathWithId(MATERIAL_PATH, '{materialId}', materialId),
        method: 'GET',
      })
      return response
    },

    async createMaterial(request) {
      return await transport.request<ResourceIdResponse>({
        path: MATERIALS_PATH,
        method: 'POST',
        body: request,
      })
    },

    async updateMaterial(materialId, request) {
      await transport.requestEmpty({
        path: pathWithId(MATERIAL_PATH, '{materialId}', materialId),
        method: 'PUT',
        body: request,
      })
    },

    async setMaterialStatus(materialId, request) {
      await transport.requestEmpty({
        path: `${pathWithId(MATERIAL_PATH, '{materialId}', materialId)}/status`,
        method: 'PUT',
        body: request,
      })
    },

    async listMaterialUnitConversions(materialId, query) {
      return await transport.requestPage<MaterialUnitConversion>({
        path: pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
        method: 'GET',
        query: materialUnitConversionsQuery(query),
      })
    },

    async getMaterialUnitConversion(materialId, materialUnitConversionId) {
      const response = await transport.request<MaterialUnitConversion>({
        path: pathWithId(
          pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId),
          '{materialUnitConversionId}',
          materialUnitConversionId,
        ),
        method: 'GET',
      })
      return response
    },

    async createMaterialUnitConversion(materialId, request) {
      return await transport.request<ResourceIdResponse>({
        path: pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
        method: 'POST',
        body: request,
      })
    },

    async updateMaterialUnitConversion(materialId, materialUnitConversionId, request) {
      await transport.requestEmpty({
        path: pathWithId(
          pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId),
          '{materialUnitConversionId}',
          materialUnitConversionId,
        ),
        method: 'PUT',
        body: request,
      })
    },

    async removeMaterialUnitConversion(materialId, materialUnitConversionId) {
      await transport.requestEmpty({
        path: pathWithId(
          pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId),
          '{materialUnitConversionId}',
          materialUnitConversionId,
        ),
        method: 'DELETE',
      })
    },
  }
}

// Eager singleton over the application's single transport (9uuf). Never `{} as
// any` — that default is what made the first runtime list call throw. Replaced
// during tests by `setCatalogService`.
let catalogService: CatalogService = createCatalogService(apiTransport)

export function setCatalogService(transport: ApiTransport) {
  catalogService = createCatalogService(transport)
}

export { catalogService }
