import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { listMaterialUnitConversions, listUnitsOfMeasure } from '@/shared/api/catalog-reads'
import type {
  ListMaterialUnitConversionsQuery,
  ListUnitsOfMeasureQuery,
} from '@/shared/types/catalog.wire-types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import {
  keepPreviousDataInSameScope,
  queryKeys,
  RESOURCES,
  type ScopeCacheKey,
} from '@/shared/services/query-keys'

const CATALOG_RESOURCE = RESOURCES.catalog

/**
 * Shared catalog master-data reads (units of measure, material unit
 * conversions) — the shared half of the catalog read seam. The hooks own the
 * TanStack cache entry; the pure service in `@/shared/api/catalog-reads.ts`
 * owns the HTTP.
 *
 * The module re-exports these two hooks (`@/modules/catalog/hooks/
 * use-catalog-queries`) so every catalog consumer keeps its import surface.
 */

export function useUnitsOfMeasureQuery(
  query: ListUnitsOfMeasureQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const cacheKeyScope: ScopeCacheKey = scope ?? { kind: 'enterprise' }
  return useQuery({
    placeholderData: keepPreviousDataInSameScope(scope),
    queryKey: queryKeys.scoped(cacheKeyScope, CATALOG_RESOURCE, 'unitsOfMeasure', query),
    queryFn: ({ signal }) => listUnitsOfMeasure(query, { signal }),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialUnitConversionsQuery(
  materialId: string | undefined,
  query: ListMaterialUnitConversionsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const cacheKeyScope: ScopeCacheKey = scope ?? { kind: 'enterprise' }
  return useQuery({
    placeholderData: keepPreviousDataInSameScope(scope),
    queryKey: queryKeys.scoped(
      cacheKeyScope,
      CATALOG_RESOURCE,
      'materials',
      materialId,
      'unitConversions',
      query,
    ),
    queryFn: ({ signal }) => listMaterialUnitConversions(materialId ?? '', query, { signal }),
    enabled:
      (options.enabled !== undefined ? options.enabled : scope !== undefined) &&
      materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
