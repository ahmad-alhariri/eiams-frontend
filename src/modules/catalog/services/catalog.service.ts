import type { ApiTransport } from '@/shared/api/api-transport'
import type {
  UnitOfMeasure,
  UnitOfMeasureUpsertRequest,
  UnitOfMeasurePage,
  MaterialDomain,
  MaterialDomainUpsertRequest,
  MaterialDomainPage,
  MaterialCategory,
  MaterialCategoryUpsertRequest,
  MaterialCategoryPage,
  MaterialFamily,
  MaterialFamilyUpsertRequest,
  MaterialFamilyPage,
  Material,
  MaterialUpsertRequest,
  MaterialPage,
  MaterialUnitConversion,
  MaterialUnitConversionUpsertRequest,
  MaterialUnitConversionPage,
  ListUnitsOfMeasureQuery,
  ListMaterialDomainsQuery,
  ListMaterialCategoriesQuery,
  ListMaterialFamiliesQuery,
  ListMaterialsQuery,
  ListMaterialUnitConversionsQuery,
} from '@/modules/catalog/types/catalog.api-types'

const UNITS_OF_MEASURE_PATH = '/catalog/units-of-measure'
const UNIT_OF_MEASURE_PATH = '/catalog/units-of-measure/{unitId}'
const MATERIAL_DOMAINS_PATH = '/catalog/material-domains'
const MATERIAL_DOMAIN_PATH = '/catalog/material-domains/{materialDomainId}'
const MATERIAL_CATEGORIES_PATH = '/catalog/material-categories'
const MATERIAL_CATEGORY_PATH = '/catalog/material-categories/{materialCategoryId}'
const MATERIAL_FAMILIES_PATH = '/catalog/material-families'
const MATERIAL_FAMILY_PATH = '/catalog/material-families/{materialFamilyId}'
const MATERIALS_PATH = '/catalog/materials'
const MATERIAL_PATH = '/catalog/materials/{materialId}'
const MATERIAL_UNIT_CONVERSIONS_PATH = '/catalog/materials/{materialId}/unit-conversions'
const MATERIAL_UNIT_CONVERSION_PATH =
  '/catalog/materials/{materialId}/unit-conversions/{materialUnitConversionId}'

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

function toPage<T>(apiPage: {
  items: ReadonlyArray<T>
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}): {
  items: ReadonlyArray<T>
  meta: {
    readonly page: number
    readonly pageSize: number
    readonly totalItems: number
    readonly totalPages: number
    readonly hasPreviousPage: boolean
    readonly hasNextPage: boolean
  }
} {
  return {
    items: apiPage.items,
    meta: {
      page: apiPage.page,
      pageSize: apiPage.pageSize,
      totalItems: apiPage.totalItems,
      totalPages: apiPage.totalPages,
      hasPreviousPage: apiPage.hasPreviousPage,
      hasNextPage: apiPage.hasNextPage,
    },
  }
}

export interface CatalogService {
  listUnitsOfMeasure: (query: ListUnitsOfMeasureQuery) => Promise<UnitOfMeasurePage>
  getUnitOfMeasure: (unitId: string) => Promise<UnitOfMeasure>
  createUnitOfMeasure: (request: UnitOfMeasureUpsertRequest) => Promise<UnitOfMeasure>
  updateUnitOfMeasure: (
    unitId: string,
    request: UnitOfMeasureUpsertRequest,
  ) => Promise<UnitOfMeasure>

  listMaterialDomains: (query: ListMaterialDomainsQuery) => Promise<MaterialDomainPage>
  getMaterialDomain: (materialDomainId: string) => Promise<MaterialDomain>
  createMaterialDomain: (request: MaterialDomainUpsertRequest) => Promise<MaterialDomain>
  updateMaterialDomain: (
    materialDomainId: string,
    request: MaterialDomainUpsertRequest,
  ) => Promise<MaterialDomain>

  listMaterialCategories: (query: ListMaterialCategoriesQuery) => Promise<MaterialCategoryPage>
  getMaterialCategory: (materialCategoryId: string) => Promise<MaterialCategory>
  createMaterialCategory: (request: MaterialCategoryUpsertRequest) => Promise<MaterialCategory>
  updateMaterialCategory: (
    materialCategoryId: string,
    request: MaterialCategoryUpsertRequest,
  ) => Promise<MaterialCategory>

  listMaterialFamilies: (query: ListMaterialFamiliesQuery) => Promise<MaterialFamilyPage>
  getMaterialFamily: (materialFamilyId: string) => Promise<MaterialFamily>
  createMaterialFamily: (request: MaterialFamilyUpsertRequest) => Promise<MaterialFamily>
  updateMaterialFamily: (
    materialFamilyId: string,
    request: MaterialFamilyUpsertRequest,
  ) => Promise<MaterialFamily>

  listMaterials: (query: ListMaterialsQuery) => Promise<MaterialPage>
  getMaterial: (materialId: string) => Promise<Material>
  createMaterial: (request: MaterialUpsertRequest) => Promise<Material>
  updateMaterial: (materialId: string, request: MaterialUpsertRequest) => Promise<Material>

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
    request: MaterialUnitConversionUpsertRequest,
  ) => Promise<MaterialUnitConversion>
  updateMaterialUnitConversion: (
    materialId: string,
    materialUnitConversionId: string,
    request: MaterialUnitConversionUpsertRequest,
  ) => Promise<MaterialUnitConversion>
}

export function createCatalogService(transport: ApiTransport): CatalogService {
  return {
    async listUnitsOfMeasure(query) {
      const page = await transport.requestPage<UnitOfMeasure>({
        path: UNITS_OF_MEASURE_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as UnitOfMeasurePage
    },

    async getUnitOfMeasure(unitId) {
      const response = await transport.request<UnitOfMeasure>({
        path: pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
        method: 'GET',
      })
      return response.data
    },

    async createUnitOfMeasure(request) {
      const response = await transport.request<UnitOfMeasure>({
        path: UNITS_OF_MEASURE_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateUnitOfMeasure(unitId, request) {
      const response = await transport.request<UnitOfMeasure>({
        path: pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listMaterialDomains(query) {
      const page = await transport.requestPage<MaterialDomain>({
        path: MATERIAL_DOMAINS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as MaterialDomainPage
    },

    async getMaterialDomain(materialDomainId) {
      const response = await transport.request<MaterialDomain>({
        path: pathWithId(MATERIAL_DOMAIN_PATH, '{materialDomainId}', materialDomainId),
        method: 'GET',
      })
      return response.data
    },

    async createMaterialDomain(request) {
      const response = await transport.request<MaterialDomain>({
        path: MATERIAL_DOMAINS_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateMaterialDomain(materialDomainId, request) {
      const response = await transport.request<MaterialDomain>({
        path: pathWithId(MATERIAL_DOMAIN_PATH, '{materialDomainId}', materialDomainId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listMaterialCategories(query) {
      const page = await transport.requestPage<MaterialCategory>({
        path: MATERIAL_CATEGORIES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as MaterialCategoryPage
    },

    async getMaterialCategory(materialCategoryId) {
      const response = await transport.request<MaterialCategory>({
        path: pathWithId(MATERIAL_CATEGORY_PATH, '{materialCategoryId}', materialCategoryId),
        method: 'GET',
      })
      return response.data
    },

    async createMaterialCategory(request) {
      const response = await transport.request<MaterialCategory>({
        path: MATERIAL_CATEGORIES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateMaterialCategory(materialCategoryId, request) {
      const response = await transport.request<MaterialCategory>({
        path: pathWithId(MATERIAL_CATEGORY_PATH, '{materialCategoryId}', materialCategoryId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listMaterialFamilies(query) {
      const page = await transport.requestPage<MaterialFamily>({
        path: MATERIAL_FAMILIES_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as MaterialFamilyPage
    },

    async getMaterialFamily(materialFamilyId) {
      const response = await transport.request<MaterialFamily>({
        path: pathWithId(MATERIAL_FAMILY_PATH, '{materialFamilyId}', materialFamilyId),
        method: 'GET',
      })
      return response.data
    },

    async createMaterialFamily(request) {
      const response = await transport.request<MaterialFamily>({
        path: MATERIAL_FAMILIES_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateMaterialFamily(materialFamilyId, request) {
      const response = await transport.request<MaterialFamily>({
        path: pathWithId(MATERIAL_FAMILY_PATH, '{materialFamilyId}', materialFamilyId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listMaterials(query) {
      const page = await transport.requestPage<Material>({
        path: MATERIALS_PATH,
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as MaterialPage
    },

    async getMaterial(materialId) {
      const response = await transport.request<Material>({
        path: pathWithId(MATERIAL_PATH, '{materialId}', materialId),
        method: 'GET',
      })
      return response.data
    },

    async createMaterial(request) {
      const response = await transport.request<Material>({
        path: MATERIALS_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateMaterial(materialId, request) {
      const response = await transport.request<Material>({
        path: pathWithId(MATERIAL_PATH, '{materialId}', materialId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },

    async listMaterialUnitConversions(materialId, query) {
      const page = await transport.requestPage<MaterialUnitConversion>({
        path: pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
        method: 'GET',
        query: query as Record<string, string | number | boolean | undefined>,
      })
      return toPage(page) as unknown as MaterialUnitConversionPage
    },

    async getMaterialUnitConversion(materialId, materialUnitConversionId) {
      const response = await transport.request<MaterialUnitConversion>({
        path: pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId).replace(
          '{materialUnitConversionId}',
          encodeURIComponent(materialUnitConversionId),
        ),
        method: 'GET',
      })
      return response.data
    },

    async createMaterialUnitConversion(materialId, request) {
      const response = await transport.request<MaterialUnitConversion>({
        path: pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
        method: 'POST',
        body: request,
      })
      return response.data
    },

    async updateMaterialUnitConversion(materialId, materialUnitConversionId, request) {
      const response = await transport.request<MaterialUnitConversion>({
        path: pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId).replace(
          '{materialUnitConversionId}',
          encodeURIComponent(materialUnitConversionId),
        ),
        method: 'PUT',
        body: request,
      })
      return response.data
    },
  }
}

// Lazy singleton — replaced during tests by `setCatalogService`.
let catalogService: CatalogService = createCatalogService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function setCatalogService(transport: ApiTransport) {
  catalogService = createCatalogService(transport)
}

export { catalogService }
