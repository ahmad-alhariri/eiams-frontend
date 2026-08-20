import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { receivingService } from '@/modules/receiving/services/receiving.service'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const RECEIVING_RESOURCE = 'receiving'

/** The contract's minimum suggestion query length; AsyncSelect enforces it too. */
export const SUPPLIER_SEARCH_MIN_LENGTH = 2

export const receivingQueryKeys = {
  suppliers: (scope: ScopeCacheKey, search: string) =>
    queryKeys.scoped(scope, RECEIVING_RESOURCE, 'suppliers', search),
}

export interface ReceivingSuppliersLoaderResult {
  /**
   * AsyncSelect-compatible suggestion loader for the receiving petal. Each
   * query runs through the shared query client (`fetchQuery`), so repeated
   * searches reuse the cached response within the operational stale window
   * and concurrent identical queries deduplicate into one request.
   */
  loadOptions: OptionLoader<string>
  /** False until the session has an active scope; callers disable the control. */
  scopeReady: boolean
}

/**
 * Scope-bound supplier-reference suggestions for the receiving petal.
 *
 * AsyncSelect owns debouncing (300ms) and the two-character trigger; this
 * loader guards both defensively and stays inert until a session scope is
 * active, so the petal never offers suppliers outside the active scope.
 *
 * Suppliers are operational (not master) data — an active count session may
 * hide them — so responses use the operational stale window.
 */
export function useReceivingSuppliersLoader(): ReceivingSuppliersLoaderResult {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const scopeReady = activeScopeCacheKey !== undefined

  const loadOptions = useCallback<OptionLoader<string>>(
    async (query) => {
      const trimmed = query.trim()
      if (activeScopeCacheKey === undefined || trimmed.length < SUPPLIER_SEARCH_MIN_LENGTH) {
        return []
      }
      const suppliers = await queryClient.fetchQuery({
        queryKey: receivingQueryKeys.suppliers(activeScopeCacheKey, trimmed),
        queryFn: () => receivingService.searchReceivingSuppliers(trimmed),
        staleTime: OPERATIONAL_STALE_TIME,
      })
      return suppliers.map((supplier) => ({ value: supplier, label: supplier }))
    },
    [activeScopeCacheKey, queryClient],
  )

  return { loadOptions, scopeReady }
}
