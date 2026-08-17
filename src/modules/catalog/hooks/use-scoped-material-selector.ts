import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import type { ListMaterialsQuery } from '@/modules/catalog/types/catalog.types'
import {
  useMaterialSelector,
  type MaterialLoader,
} from '@/shared/selectors/adapters/material-selector'
import type { EntitySelectorResult } from '@/shared/selectors/selector-adapter'
import type { Material } from '@/shared/types/generated/eiams-v1'

export interface ScopedMaterialSelectorResult extends EntitySelectorResult<Material> {
  /** False until the session has a selected active scope; callers disable the control. */
  scopeReady: boolean
}

const DEFAULT_MAX_RESULTS = 10

/**
 * Production binding of the shared material selector adapter to the active
 * session scope.
 *
 * The loader searches the contract-backed material list (server-side search)
 * while the shared adapter keeps mapping, deduplication, and the inactive
 * option state consistent with every other selector consumer. Until a scope
 * is selected the loader resolves to an empty list and `scopeReady` stays
 * false, so a line editor never offers materials outside the active scope.
 *
 * Asset-kind materials are excluded by default: the shared document engine
 * captures them through the asset-line editor (e12-t05), not the quantity
 * line editor (e12-t04). Callers that need them (e.g. the asset capture
 * flow) opt in with `includeAssetMaterials`.
 */
export function useScopedMaterialSelector(
  includeAssetMaterials = false,
  maxResults = DEFAULT_MAX_RESULTS,
): ScopedMaterialSelectorResult {
  const { activeScopeCacheKey } = useActiveScopeContext()
  const scopeReady = activeScopeCacheKey !== undefined

  const loadMaterials = useCallback<MaterialLoader>(
    async (query) => {
      if (!scopeReady) {
        return []
      }
      const listQuery: ListMaterialsQuery = {
        pageIndex: 0,
        pageSize: Math.max(1, maxResults),
        status: 'Active',
        ...(query.trim() === '' ? {} : { search: query.trim() }),
      }
      const page = await catalogService.listMaterials(listQuery)
      return includeAssetMaterials
        ? [...page.items]
        : page.items.filter((material) => material.materialKind !== 'Asset')
    },
    [includeAssetMaterials, maxResults, scopeReady],
  )

  const selector = useMaterialSelector(loadMaterials)
  return { ...selector, scopeReady }
}
