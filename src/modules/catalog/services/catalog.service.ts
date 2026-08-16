import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type {
  Material,
  MaterialCategory,
  MaterialCategoryUpsertRequest,
  MaterialDomain,
  MaterialFamily,
  MaterialFamilyUpsertRequest,
  MaterialPage,
  MaterialUnitConversion,
  MaterialUnitConversionCreateRequest,
  MaterialUnitConversionUpdateRequest,
  MaterialUpsertRequest,
  NamedCodeUpsertRequest,
  paths,
  UnitOfMeasure,
  UnitOfMeasureUpsertRequest,
} from '@/shared/types/generated/eiams-v1'
import type {
  ListMaterialCategoriesQuery,
  ListMaterialDomainsQuery,
  ListMaterialFamiliesQuery,
  ListMaterialsQuery,
} from '@/modules/catalog/types/catalog.types'

const DOMAINS_PATH = '/catalog/domains' satisfies keyof paths
const DOMAIN_PATH = '/catalog/domains/{domainId}' satisfies keyof paths
const CATEGORIES_PATH = '/catalog/categories' satisfies keyof paths
const CATEGORY_PATH = '/catalog/categories/{categoryId}' satisfies keyof paths
const FAMILIES_PATH = '/catalog/families' satisfies keyof paths
const FAMILY_PATH = '/catalog/families/{familyId}' satisfies keyof paths
const MATERIALS_PATH = '/catalog/materials' satisfies keyof paths
const MATERIAL_PATH = '/catalog/materials/{materialId}' satisfies keyof paths
const MATERIAL_UNIT_CONVERSIONS_PATH =
  '/catalog/materials/{materialId}/unit-conversions' satisfies keyof paths
const MATERIAL_UNIT_CONVERSION_PATH =
  '/catalog/materials/{materialId}/unit-conversions/{conversionId}' satisfies keyof paths
const UNITS_OF_MEASURE_PATH = '/catalog/units-of-measure' satisfies keyof paths
const UNIT_OF_MEASURE_PATH = '/catalog/units-of-measure/{unitId}' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

export interface CatalogService {
  listMaterialDomains: (query: ListMaterialDomainsQuery) => Promise<readonly MaterialDomain[]>
  getMaterialDomain: (domainId: string) => Promise<MaterialDomain>
  createMaterialDomain: (request: NamedCodeUpsertRequest) => Promise<MaterialDomain>
  updateMaterialDomain: (
    domainId: string,
    request: NamedCodeUpsertRequest,
  ) => Promise<MaterialDomain>
  listMaterialCategories: (
    query: ListMaterialCategoriesQuery,
  ) => Promise<readonly MaterialCategory[]>
  getMaterialCategory: (categoryId: string) => Promise<MaterialCategory>
  createMaterialCategory: (request: MaterialCategoryUpsertRequest) => Promise<MaterialCategory>
  updateMaterialCategory: (
    categoryId: string,
    request: MaterialCategoryUpsertRequest,
  ) => Promise<MaterialCategory>
  listMaterialFamilies: (query: ListMaterialFamiliesQuery) => Promise<readonly MaterialFamily[]>
  getMaterialFamily: (familyId: string) => Promise<MaterialFamily>
  createMaterialFamily: (request: MaterialFamilyUpsertRequest) => Promise<MaterialFamily>
  updateMaterialFamily: (
    familyId: string,
    request: MaterialFamilyUpsertRequest,
  ) => Promise<MaterialFamily>
  listMaterials: (query: ListMaterialsQuery) => Promise<MaterialPage>
  getMaterial: (materialId: string) => Promise<Material>
  createMaterial: (request: MaterialUpsertRequest) => Promise<Material>
  updateMaterial: (materialId: string, request: MaterialUpsertRequest) => Promise<Material>
  listMaterialUnitConversions: (materialId: string) => Promise<readonly MaterialUnitConversion[]>
  getMaterialUnitConversion: (
    materialId: string,
    conversionId: string,
  ) => Promise<MaterialUnitConversion>
  createMaterialUnitConversion: (
    materialId: string,
    request: MaterialUnitConversionCreateRequest,
  ) => Promise<MaterialUnitConversion>
  updateMaterialUnitConversion: (
    materialId: string,
    conversionId: string,
    request: MaterialUnitConversionUpdateRequest,
  ) => Promise<MaterialUnitConversion>
  listUnitsOfMeasure: () => Promise<readonly UnitOfMeasure[]>
  getUnitOfMeasure: (unitId: string) => Promise<UnitOfMeasure>
  createUnitOfMeasure: (request: UnitOfMeasureUpsertRequest) => Promise<UnitOfMeasure>
  updateUnitOfMeasure: (
    unitId: string,
    request: UnitOfMeasureUpsertRequest,
  ) => Promise<UnitOfMeasure>
}

/** Contract-only catalog transport; scope and concurrency remain server-authoritative. */
export function createCatalogService(client: AxiosInstance): CatalogService {
  return {
    async listMaterialDomains(query) {
      const response = await client.get<readonly MaterialDomain[]>(DOMAINS_PATH, { params: query })
      return response.data
    },
    async getMaterialDomain(domainId) {
      const response = await client.get<MaterialDomain>(
        pathWithId(DOMAIN_PATH, '{domainId}', domainId),
      )
      return response.data
    },
    async createMaterialDomain(request) {
      const response = await client.post<MaterialDomain>(DOMAINS_PATH, request)
      return response.data
    },
    async updateMaterialDomain(domainId, request) {
      const response = await client.put<MaterialDomain>(
        pathWithId(DOMAIN_PATH, '{domainId}', domainId),
        request,
      )
      return response.data
    },
    async listMaterialCategories(query) {
      const response = await client.get<readonly MaterialCategory[]>(CATEGORIES_PATH, {
        params: query,
      })
      return response.data
    },
    async getMaterialCategory(categoryId) {
      const response = await client.get<MaterialCategory>(
        pathWithId(CATEGORY_PATH, '{categoryId}', categoryId),
      )
      return response.data
    },
    async createMaterialCategory(request) {
      const response = await client.post<MaterialCategory>(CATEGORIES_PATH, request)
      return response.data
    },
    async updateMaterialCategory(categoryId, request) {
      const response = await client.put<MaterialCategory>(
        pathWithId(CATEGORY_PATH, '{categoryId}', categoryId),
        request,
      )
      return response.data
    },
    async listMaterialFamilies(query) {
      const response = await client.get<readonly MaterialFamily[]>(FAMILIES_PATH, { params: query })
      return response.data
    },
    async getMaterialFamily(familyId) {
      const response = await client.get<MaterialFamily>(
        pathWithId(FAMILY_PATH, '{familyId}', familyId),
      )
      return response.data
    },
    async createMaterialFamily(request) {
      const response = await client.post<MaterialFamily>(FAMILIES_PATH, request)
      return response.data
    },
    async updateMaterialFamily(familyId, request) {
      const response = await client.put<MaterialFamily>(
        pathWithId(FAMILY_PATH, '{familyId}', familyId),
        request,
      )
      return response.data
    },
    async listMaterials(query) {
      const response = await client.get<MaterialPage>(MATERIALS_PATH, { params: query })
      return response.data
    },
    async getMaterial(materialId) {
      const response = await client.get<Material>(
        pathWithId(MATERIAL_PATH, '{materialId}', materialId),
      )
      return response.data
    },
    async createMaterial(request) {
      const response = await client.post<Material>(MATERIALS_PATH, request)
      return response.data
    },
    async updateMaterial(materialId, request) {
      const response = await client.put<Material>(
        pathWithId(MATERIAL_PATH, '{materialId}', materialId),
        request,
      )
      return response.data
    },
    async listMaterialUnitConversions(materialId) {
      const response = await client.get<readonly MaterialUnitConversion[]>(
        pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
      )
      return response.data
    },
    async getMaterialUnitConversion(materialId, conversionId) {
      const materialPath = pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId)
      const response = await client.get<MaterialUnitConversion>(
        pathWithId(materialPath, '{conversionId}', conversionId),
      )
      return response.data
    },
    async createMaterialUnitConversion(materialId, request) {
      const response = await client.post<MaterialUnitConversion>(
        pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
        request,
      )
      return response.data
    },
    async updateMaterialUnitConversion(materialId, conversionId, request) {
      const materialPath = pathWithId(MATERIAL_UNIT_CONVERSION_PATH, '{materialId}', materialId)
      const response = await client.put<MaterialUnitConversion>(
        pathWithId(materialPath, '{conversionId}', conversionId),
        request,
      )
      return response.data
    },
    async listUnitsOfMeasure() {
      const response = await client.get<readonly UnitOfMeasure[]>(UNITS_OF_MEASURE_PATH)
      return response.data
    },
    async getUnitOfMeasure(unitId) {
      const response = await client.get<UnitOfMeasure>(
        pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
      )
      return response.data
    },
    async createUnitOfMeasure(request) {
      const response = await client.post<UnitOfMeasure>(UNITS_OF_MEASURE_PATH, request)
      return response.data
    },
    async updateUnitOfMeasure(unitId, request) {
      const response = await client.put<UnitOfMeasure>(
        pathWithId(UNIT_OF_MEASURE_PATH, '{unitId}', unitId),
        request,
      )
      return response.data
    },
  }
}

export const catalogService = createCatalogService(apiClient)
