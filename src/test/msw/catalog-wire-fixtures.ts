import type {
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.api-types'

import { fixtureUuid } from './factories'

/**
 * Catalog fixtures in the REAL wire shape (`catalog.api-types`), built locally.
 *
 * WHY NOT THE SHARED FACTORIES. The master-data factories in `./factories`
 * (`createMaterialDomain`, `createMaterialCategory`, `createMaterialFamily`,
 * `createUnitOfMeasure`, `createMaterialUnitConversion`) now mint these same
 * records; the one that still cannot is `createMaterial`, which is typed
 * against the frozen generated `Material` (`domain` / `category` / `family` /
 * `baseUnit`, `materialId`, `rowVersion`) because the DOCUMENT-engine fixtures
 * embed that shape inside the generated `DocumentLine` / `InventoryBalance` /
 * `StockMovement`. Serving it from a `/catalog/materials` handler is the same
 * fiction the organization suite hit before `txq4`: a fixture the production
 * response could never produce keeps a test green against the wrong contract.
 * So the material record is minted HERE, and every catalog-consuming suite
 * reads this builder.
 *
 * Everything below is FLAT. No catalog projection nests a
 * `NamedReference` any more — the material record carries flat
 * `materialDomainId` / `materialDomainName` / `baseUnitId` / `baseUnitSymbol`,
 * and a unit conversion carries a flat `fromUnitId` whose label the UI resolves
 * from the units-of-measure list.
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
export const CATALOG_CONVERSION_ID = fixtureUuid(25)
export const CATALOG_ALT_UNIT_ID = fixtureUuid(26)

function withOverrides<T extends object>(defaults: T, overrides: Partial<T>): T {
  return { ...defaults, ...overrides }
}

/** `GET /catalog/units-of-measure` — `{ id, name, symbol, unitType, status }`.
 *  No `code`, no `nameAr`, no `symbolAr`, no `nominalConversionFactor`: the
 *  conversion story lives on `MaterialUnitConversion` now. */
export function wireUnitOfMeasure(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return withOverrides(
    {
      id: CATALOG_UNIT_ID,
      name: 'قطعة',
      symbol: 'EA',
      unitType: 'Quantity',
      status: 'Active',
    },
    overrides,
  )
}

/** `GET /catalog/domains` — the id is `id`, not `materialDomainId`/`domainId`,
 *  and the label is `name`, not `nameAr`. Not versioned: no `rowVersion`. */
export function wireMaterialDomain(overrides: Partial<MaterialDomain> = {}): MaterialDomain {
  return withOverrides(
    {
      id: CATALOG_DOMAIN_ID,
      name: 'تقنية المعلومات',
      code: 'IT',
      status: 'Active',
    },
    overrides,
  )
}

/** `GET /catalog/categories` — flat `{ id, materialDomainId, parentCategoryId,
 *  name, code, status }`, with no nested `materialDomain` reference. */
export function wireMaterialCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return withOverrides(
    {
      id: CATALOG_CATEGORY_ID,
      materialDomainId: CATALOG_DOMAIN_ID,
      parentCategoryId: null,
      name: 'الأجهزة',
      code: 'IT-HW',
      status: 'Active',
    },
    overrides,
  )
}

/** `GET /catalog/families` — the parent reference is the flat `categoryId`
 *  (`categoryId`, NOT `materialCategoryId`). */
export function wireMaterialFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  return withOverrides(
    {
      id: CATALOG_FAMILY_ID,
      categoryId: CATALOG_CATEGORY_ID,
      name: 'الحواسيب',
      code: 'IT-HW-PC',
      status: 'Active',
    },
    overrides,
  )
}

/**
 * `GET /catalog/materials`.
 *
 * `materialDomainId`/`materialDomainName` are the DERIVED domain pair and
 * `baseUnitId`/`baseUnitSymbol` the material's own base unit; `familyId` is
 * create-only. `catalogVersion` is the ONE version field in this module and it
 * is NOT called `rowVersion`.
 */
export function wireMaterial(overrides: Partial<Material> = {}): Material {
  return withOverrides(
    {
      id: CATALOG_MATERIAL_ID,
      familyId: CATALOG_FAMILY_ID,
      nameAr: 'حاسوب مكتبي',
      nameEn: null,
      code: 'IT-HW-PC-001',
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      requiresAssetNumber: false,
      catalogVersion: 1,
      attributes: null,
      status: 'Active',
      materialDomainId: CATALOG_DOMAIN_ID,
      materialDomainName: 'تقنية المعلومات',
      baseUnitId: CATALOG_UNIT_ID,
      baseUnitSymbol: 'EA',
    },
    overrides,
  )
}

/**
 * `GET /catalog/materials/{materialId}/unit-conversions`. The factor is the
 * NUMBER the contract declares; the generated fixture's string `'12'` is the
 * fiction `docs/material-unit-conversion-contract-decision.md` retired.
 *
 * There is no `status`: a conversion's lifecycle ends in DELETE, so no
 * fixture may mint a status the route does not serve.
 */
export function wireMaterialUnitConversion(
  overrides: Partial<MaterialUnitConversion> = {},
): MaterialUnitConversion {
  return withOverrides(
    {
      id: CATALOG_CONVERSION_ID,
      materialId: CATALOG_MATERIAL_ID,
      fromUnitId: CATALOG_ALT_UNIT_ID,
      toBaseUnitId: CATALOG_UNIT_ID,
      factor: 12,
    },
    overrides,
  )
}
