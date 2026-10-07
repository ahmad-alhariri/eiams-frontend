import type {
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  MaterialUnitConversion,
  NamedReference,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.api-types'

import { fixtureUuid } from './factories'

/**
 * Catalog fixtures in the REAL wire shape (`catalog.api-types`), built locally.
 *
 * WHY NOT THE SHARED FACTORIES. `createMaterialDomain`, `createMaterialCategory`,
 * `createMaterialFamily`, `createMaterial` and `createUnitOfMeasure` in
 * `./factories` still mint the FROZEN GENERATED snapshot's records — `domainId`,
 * `categoryId`, `familyId`, `baseUnit`, nested `domain` / `category` / `family`,
 * `symbolAr`, `trackingType`, and a string `factor`. The production catalog
 * service and pages read none of those: they read `materialDomainId`,
 * `materialCategoryId`, `materialFamilyId`, `unit`, `materialDomain`,
 * `materialCategory`, `materialFamily` and a numeric `conversionFactor`
 * (D-INT-02 / ADR-0001).
 *
 * That is the same fiction the organization suite hit before `txq4`: a fixture
 * the production response could never produce keeps a test green against the
 * wrong contract. `createMaterial` in particular cannot simply be corrected in
 * place, because the document, inventory, custody and selector suites consume
 * its generated shape; the mismatch is filed against `eiams-frontend-tgl3`.
 * So the catalog wire records are minted HERE instead, once, and every catalog
 * suite reads the same builders.
 *
 * The identifiers are the same deterministic UUIDs `fixtureUuid` hands out, so
 * a catalog record here still joins against the shared warehouse/document
 * fixtures (`warehouseId`, `materialId`, ...).
 */

export const CATALOG_DOMAIN_ID = fixtureUuid(20)
export const CATALOG_CATEGORY_ID = fixtureUuid(21)
export const CATALOG_FAMILY_ID = fixtureUuid(22)
export const CATALOG_UNIT_ID = fixtureUuid(23)
export const CATALOG_MATERIAL_ID = fixtureUuid(24)
export const CATALOG_CONVERSION_ID = fixtureUuid(26)

function withOverrides<T extends object>(defaults: T, overrides: Partial<T>): T {
  return { ...defaults, ...overrides }
}

export function wireNamedReference(id: string, displayName: string): NamedReference {
  return { id, displayName }
}

/** `GET /catalog/units-of-measure` — `descriptionAr`/`baseUnitId`, never `symbolAr`. */
export function wireUnitOfMeasure(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return withOverrides(
    {
      unitId: CATALOG_UNIT_ID,
      code: 'EA',
      nameAr: 'قطعة',
      descriptionAr: null,
      nominalConversionFactor: 1,
      baseUnitId: null,
      baseUnit: null,
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

/** `GET /catalog/material-domains` — the id is `materialDomainId`, not `domainId`. */
export function wireMaterialDomain(overrides: Partial<MaterialDomain> = {}): MaterialDomain {
  return withOverrides(
    {
      materialDomainId: CATALOG_DOMAIN_ID,
      nameAr: 'تقنية المعلومات',
      code: 'IT',
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

/**
 * `GET /catalog/material-categories`.
 *
 * The parent reference is a `NamedReference` (`id` + `displayName`), so to move
 * a record into another domain pass
 * `materialDomain: wireNamedReference(otherDomainId, otherDomainName)`; the flat
 * `materialDomainId` then follows the reference, so a fixture can never pair an
 * id with a reference naming a different domain.
 */
export function wireMaterialCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  const materialDomain =
    overrides.materialDomain ?? wireNamedReference(CATALOG_DOMAIN_ID, 'تقنية المعلومات')
  return withOverrides(
    {
      materialCategoryId: CATALOG_CATEGORY_ID,
      nameAr: 'الأجهزة',
      code: 'IT-HW',
      parentCategoryId: null,
      parentCategory: null,
      materialDomainId: materialDomain.id,
      materialDomain,
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

/** `GET /catalog/material-families` — the parent reference is `materialCategory`. */
export function wireMaterialFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  const materialCategory =
    overrides.materialCategory ?? wireNamedReference(CATALOG_CATEGORY_ID, 'الأجهزة')
  return withOverrides(
    {
      materialFamilyId: CATALOG_FAMILY_ID,
      nameAr: 'الحواسيب',
      code: 'IT-HW-PC',
      parentFamilyId: null,
      parentFamily: null,
      materialCategoryId: materialCategory.id,
      materialCategory,
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

/**
 * `GET /catalog/materials`.
 *
 * `unit` (not `baseUnit`), no `trackingType`, and every level of the hierarchy
 * arrives as a `NamedReference` the detail screen renders directly.
 */
export function wireMaterial(overrides: Partial<Material> = {}): Material {
  const materialFamily =
    overrides.materialFamily ?? wireNamedReference(CATALOG_FAMILY_ID, 'الحواسيب')
  const materialCategory =
    overrides.materialCategory ?? wireNamedReference(CATALOG_CATEGORY_ID, 'الأجهزة')
  const materialDomain =
    overrides.materialDomain ?? wireNamedReference(CATALOG_DOMAIN_ID, 'تقنية المعلومات')
  const unit = overrides.unit ?? wireNamedReference(CATALOG_UNIT_ID, 'قطعة')
  return withOverrides(
    {
      materialId: CATALOG_MATERIAL_ID,
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      descriptionAr: 'مادة تجريبية',
      materialFamilyId: overrides.materialFamilyId ?? materialFamily.id,
      materialFamily,
      materialCategoryId: overrides.materialCategoryId ?? materialCategory.id,
      materialCategory,
      materialDomainId: overrides.materialDomainId ?? materialDomain.id,
      materialDomain,
      unitId: overrides.unitId ?? unit.id,
      unit,
      nominalConversionFactor: 1,
      materialKind: 'Consumable',
      requiresAssetNumber: false,
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

/**
 * `GET /catalog/materials/{materialId}/unit-conversions`. The factor is the
 * NUMBER the contract declares; the generated fixture's string `'12'` is the
 * fiction `docs/material-unit-conversion-contract-decision.md` retired.
 */
export function wireMaterialUnitConversion(
  overrides: Partial<MaterialUnitConversion> = {},
): MaterialUnitConversion {
  const material = overrides.material ?? wireNamedReference(CATALOG_MATERIAL_ID, 'حاسوب مكتبي')
  const unit = overrides.unit ?? wireNamedReference(fixtureUuid(26), 'كرتونة')
  return withOverrides(
    {
      materialUnitConversionId: CATALOG_CONVERSION_ID,
      materialId: material.id,
      material,
      unitId: unit.id,
      unit,
      conversionFactor: 12,
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}
