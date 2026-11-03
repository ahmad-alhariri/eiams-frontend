import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type { ListWarehousesQuery, Warehouse } from '@/modules/warehouse/types/warehouse.types'
import {
  useWarehouseSelector,
  type WarehouseLoader,
} from '@/shared/selectors/adapters/warehouse-selector'
import type { EntitySelectorResult } from '@/shared/selectors/selector-adapter'

export interface ScopedWarehouseSelectorResult extends EntitySelectorResult<Warehouse> {
  /** False until the session has a selected active scope; callers disable the control. */
  scopeReady: boolean
}

const DEFAULT_MAX_RESULTS = 10

/**
 * Production binding of the shared warehouse selector adapter to the active
 * session scope.
 *
 * The loader searches the contract-backed warehouse list (server-side search)
 * while the shared adapter keeps mapping, deduplication, and the inactive
 * option state consistent with every other selector consumer. Until a scope
 * is selected the loader resolves to an empty list and `scopeReady` stays
 * false, so a form never offers warehouses outside the active scope.
 */
export function useScopedWarehouseSelector(
  maxResults = DEFAULT_MAX_RESULTS,
): ScopedWarehouseSelectorResult {
  const { activeScopeCacheKey } = useActiveScopeContext()
  const scopeReady = activeScopeCacheKey !== undefined

  const loadWarehouses = useCallback<WarehouseLoader>(
    async (query) => {
      if (!scopeReady) {
        return []
      }
      const listQuery: ListWarehousesQuery = {
        // `page` is ONE-based on both sides: `useServerPagination`/DataTable are
        // one-based and so is the wire (`PaginationQueryParameters.Page` is
        // `Range(1, …)`). A zero-based `page: 0` here sent `page=0`, which the
        // backend rejects with 400 on every selector load (F-05). The service
        // clamps too, but the honest value is 1.
        page: 1,
        pageSize: Math.max(1, maxResults),
        ...(query.trim() === '' ? {} : { search: query.trim() }),
      }
      const page = await warehouseService.listWarehouses(listQuery)
      return [...page.items]
    },
    [maxResults, scopeReady],
  )

  const selector = useWarehouseSelector(loadWarehouses)
  return { ...selector, scopeReady }
}
