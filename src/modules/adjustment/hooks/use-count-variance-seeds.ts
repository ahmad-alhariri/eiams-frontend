import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import { queryKeys } from '@/shared/services/query-keys'

/**
 * Catalog name resolution for count-seeded adjustment lines (e21-t04).
 *
 * The live count line DTO carries `materialId` only, so each unique seed
 * id is resolved through the catalog's single read with the SAME scoped query
 * key as the catalog module's own `useMaterialQuery` (shared cache, one fetch
 * per id). `namesResolved` means every id has FINISHED (success or error) so
 * callers can gate the seed without hanging when a material became
 * unreadable; an unresolved id falls back to the raw id, never a crash.
 */
export function useCountVarianceSeeds(materialIds: readonly string[]) {
  const { activeScopeCacheKey } = useActiveScopeContext()

  const uniqueIds = useMemo(() => [...new Set(materialIds)], [materialIds])
  const nameQueries = useQueries({
    queries: uniqueIds.map((materialId) => ({
      queryKey: queryKeys.scoped(
        activeScopeCacheKey ?? { kind: 'enterprise' },
        'catalog',
        'materials',
        materialId,
      ),
      queryFn: () => catalogService.getMaterial(materialId),
      enabled: activeScopeCacheKey !== undefined,
    })),
  })

  const names = useMemo(
    () =>
      new Map(
        uniqueIds.flatMap((materialId, index) => {
          const name = nameQueries[index]?.data?.nameAr
          return name === undefined ? [] : [[materialId, name] as const]
        }),
      ),
    [nameQueries, uniqueIds],
  )
  // Index-aligned with `nameQueries` by useQueries' stable contract.
  const namesResolved =
    uniqueIds.length === 0 ||
    uniqueIds.every((_, index) => {
      const query = nameQueries[index]
      return query !== undefined && (query.isSuccess || query.isError)
    })

  return { names, namesResolved } as const
}
