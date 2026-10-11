import { catalogService } from '@/modules/catalog/services/catalog.service'

import { useQuery } from '@tanstack/react-query'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type {
  ListMaterialCategoriesQuery,
  ListMaterialDomainsQuery,
  ListMaterialFamiliesQuery,
  ListMaterialsQuery,
  ListMaterialUnitConversionsQuery,
  ListUnitsOfMeasureQuery,
} from '@/modules/catalog/types/catalog.api-types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const CATALOG_RESOURCE = 'catalog'

/**
 * The catalog module's cache namespace.
 *
 * A key is `scoped` + the active scope + `catalog` + the module's own resource
 * segment + the query object. The segment AFTER `catalog` is the module's
 * vocabulary (`materialDomains`, `unitsOfMeasure`, ...), NOT the wire endpoint
 * spelling — that lives in the service, which is what lets `/catalog/domains`
 * and the `materialDomains` cache segment disagree without breaking anything.
 */
export const catalogQueryKeys = {
  unitsOfMeasure: (scope: ScopeCacheKey, query: ListUnitsOfMeasureQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'unitsOfMeasure', query),
  unitOfMeasure: (scope: ScopeCacheKey, unitId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'unitsOfMeasure', unitId),
  materialDomains: (scope: ScopeCacheKey, query: ListMaterialDomainsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialDomains', query),
  materialDomain: (scope: ScopeCacheKey, materialDomainId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialDomains', materialDomainId),
  materialCategories: (scope: ScopeCacheKey, query: ListMaterialCategoriesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialCategories', query),
  materialCategory: (scope: ScopeCacheKey, materialCategoryId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialCategories', materialCategoryId),
  materialFamilies: (scope: ScopeCacheKey, query: ListMaterialFamiliesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialFamilies', query),
  materialFamily: (scope: ScopeCacheKey, materialFamilyId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialFamilies', materialFamilyId),
  materials: (scope: ScopeCacheKey, query: ListMaterialsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', query),
  material: (scope: ScopeCacheKey, materialId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId),
  materialUnitConversions: (
    scope: ScopeCacheKey,
    materialId: string,
    query: ListMaterialUnitConversionsQuery,
  ) => queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId, 'unitConversions', query),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

/**
 * These hooks are NOT the place to translate pagination: the UI controls are
 * one-based already (`useServerPagination` starts at 1, `DataTableServer` counts
 * from 1) and so is the wire, so a conversion here would be exactly the
 * subtract-then-add that produced `page=0` — which the backend answers with 400
 * `REQUEST_VALIDATION_FAILED`. The clamp into the ranges the backend actually
 * binds (`page` in `[1, 21474836]`, `pageSize` in `[1, 100]`) happens once, in
 * `toWireOneBasedPaginationParams` inside the service. A caller holding a
 * ZERO-based index converts with `toWirePaginationParams` BEFORE reaching these
 * hooks, never after.
 */
export function useUnitsOfMeasureQuery(
  query: ListUnitsOfMeasureQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'unitsOfMeasure',
      query,
    ),
    queryFn: () => catalogService.listUnitsOfMeasure(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUnitOfMeasureQuery(unitId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'unitsOfMeasure',
      unitId,
    ),
    queryFn: () => catalogService.getUnitOfMeasure(unitId ?? ''),
    enabled: scope !== undefined && unitId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialDomainsQuery(
  query: ListMaterialDomainsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialDomains',
      query,
    ),
    queryFn: () => catalogService.listMaterialDomains(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialDomainQuery(materialDomainId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialDomains',
      materialDomainId,
    ),
    queryFn: () => catalogService.getMaterialDomain(materialDomainId ?? ''),
    enabled: scope !== undefined && materialDomainId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoriesQuery(
  query: ListMaterialCategoriesQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialCategories',
      query,
    ),
    queryFn: () => catalogService.listMaterialCategories(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoryQuery(materialCategoryId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialCategories',
      materialCategoryId,
    ),
    queryFn: () => catalogService.getMaterialCategory(materialCategoryId ?? ''),
    enabled: scope !== undefined && materialCategoryId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamiliesQuery(
  query: ListMaterialFamiliesQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialFamilies',
      query,
    ),
    queryFn: () => catalogService.listMaterialFamilies(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamilyQuery(materialFamilyId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialFamilies',
      materialFamilyId,
    ),
    queryFn: () => catalogService.getMaterialFamily(materialFamilyId ?? ''),
    enabled: scope !== undefined && materialFamilyId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialsQuery(
  query: ListMaterialsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      query,
    ),
    queryFn: () => catalogService.listMaterials(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialQuery(materialId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      materialId,
    ),
    queryFn: () => catalogService.getMaterial(materialId ?? ''),
    enabled: scope !== undefined && materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialUnitConversionsQuery(
  materialId: string | undefined,
  query: ListMaterialUnitConversionsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      materialId,
      'unitConversions',
      query,
    ),
    queryFn: () => catalogService.listMaterialUnitConversions(materialId ?? '', query),
    enabled:
      (options.enabled !== undefined ? options.enabled : scope !== undefined) &&
      materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
