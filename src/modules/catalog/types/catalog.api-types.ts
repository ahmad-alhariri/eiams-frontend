/**
 * Catalog module API types — handwritten contracts for direct backend integration.
 *
 * These types match the backend's actual JSON serialization (field names, shapes, enums).
 * They replace the generated imports from `@/shared/types/generated/eiams-v1`.
 */

export type Uuid = string
export type RecordStatus = 'Active' | 'Inactive'

export interface NamedReference {
  readonly id: string
  readonly displayName: string
}

export type CatalogStatus = 'Active' | 'Inactive'

export interface PageMeta {
  readonly pageIndex: number
  readonly pageSize: number
  readonly itemCount: number
  readonly totalItems: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
  readonly hasPreviousPage: boolean
}

// ---------------------------------------------------------------------------
// Units of Measure
// ---------------------------------------------------------------------------

export interface UnitOfMeasure {
  readonly unitId: Uuid
  readonly code: string
  readonly nameAr: string
  readonly descriptionAr: string | null
  readonly nominalConversionFactor: number
  readonly baseUnitId: Uuid | null
  readonly baseUnit: NamedReference | null
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface UnitOfMeasureUpsertRequest {
  readonly code: string
  readonly nameAr: string
  readonly descriptionAr: string | null
  readonly nominalConversionFactor: number
  readonly baseUnitId: Uuid | null
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface UnitOfMeasurePage {
  readonly items: ReadonlyArray<UnitOfMeasure>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Material Domains
// ---------------------------------------------------------------------------

export interface MaterialDomain {
  readonly materialDomainId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialDomainUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialDomainPage {
  readonly items: ReadonlyArray<MaterialDomain>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Material Categories
// ---------------------------------------------------------------------------

export interface MaterialCategory {
  readonly materialCategoryId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly parentCategoryId: Uuid | null
  readonly parentCategory: NamedReference | null
  readonly materialDomainId: Uuid
  readonly materialDomain: NamedReference
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialCategoryUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly parentCategoryId: Uuid | null
  readonly materialDomainId: Uuid
  readonly status: CatalogStatus
  readonly rowVersion: number
  readonly descriptionAr?: string | null
}

export interface MaterialCategoryPage {
  readonly items: ReadonlyArray<MaterialCategory>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Material Families
// ---------------------------------------------------------------------------

export interface MaterialFamily {
  readonly materialFamilyId: Uuid
  readonly nameAr: string
  readonly code: string
  readonly parentFamilyId: Uuid | null
  readonly parentFamily: NamedReference | null
  readonly materialCategoryId: Uuid
  readonly materialCategory: NamedReference
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialFamilyUpsertRequest {
  readonly nameAr: string
  readonly code: string
  readonly parentFamilyId: Uuid | null
  readonly materialCategoryId: Uuid
  readonly status: CatalogStatus
  readonly rowVersion: number
  readonly descriptionAr?: string | null
}

export interface MaterialFamilyPage {
  readonly items: ReadonlyArray<MaterialFamily>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface Material {
  readonly materialId: Uuid
  readonly code: string
  readonly nameAr: string
  readonly descriptionAr: string | null
  readonly materialFamilyId: Uuid
  readonly materialFamily: NamedReference
  readonly materialCategoryId: Uuid
  readonly materialCategory: NamedReference
  readonly materialDomainId: Uuid
  readonly materialDomain: NamedReference
  readonly unitId: Uuid
  readonly unit: NamedReference
  readonly nominalConversionFactor: number
  readonly materialKind: 'Consumable' | 'Asset'
  readonly requiresAssetNumber: boolean
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialUpsertRequest {
  readonly code: string
  readonly nameAr: string
  readonly descriptionAr: string | null
  readonly materialFamilyId: Uuid
  readonly unitId: Uuid
  readonly nominalConversionFactor: number
  readonly materialKind: 'Consumable' | 'Asset'
  readonly requiresAssetNumber: boolean
  readonly status: CatalogStatus
  readonly rowVersion: number
  readonly parentMaterialId?: Uuid | null
}

export interface MaterialPage {
  readonly items: ReadonlyArray<Material>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Material Unit Conversions
// ---------------------------------------------------------------------------

export interface MaterialUnitConversion {
  readonly materialUnitConversionId: Uuid
  readonly materialId: Uuid
  readonly material: NamedReference
  readonly unitId: Uuid
  readonly unit: NamedReference
  readonly conversionFactor: number
  readonly status: CatalogStatus
  readonly rowVersion: number
}

export interface MaterialUnitConversionUpsertRequest {
  readonly materialId: Uuid
  readonly unitId: Uuid
  readonly conversionFactor: number
  readonly status: CatalogStatus
  readonly rowVersion: number
  readonly descriptionAr?: string | null
}

export interface MaterialUnitConversionPage {
  readonly items: ReadonlyArray<MaterialUnitConversion>
  readonly meta: PageMeta
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export interface ListUnitsOfMeasureQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
  readonly symbolAr?: string
}

export interface ListMaterialDomainsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
}

export interface ListMaterialCategoriesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
  readonly domainId?: string
}

export interface ListMaterialFamiliesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
  readonly categoryId?: string
}

export interface ListMaterialsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
  readonly materialKind?: 'Consumable' | 'Asset'
  readonly domainId?: string
  readonly categoryId?: string
  readonly familyId?: string
}

export interface ListMaterialUnitConversionsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly search?: string
  readonly status?: CatalogStatus
}
