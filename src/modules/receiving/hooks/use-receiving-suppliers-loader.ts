import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  receivingService,
  type SupplierSuggestion,
} from '@/modules/receiving/services/receiving.service'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const RECEIVING_RESOURCE = 'receiving'

/** The contract's minimum suggestion query length; AsyncSelect enforces it too. */
export const SUPPLIER_SEARCH_MIN_LENGTH = 2

/** The contract's maximum suggestion query length (`GetSupplierSuggestionsQueryValidator`). */
const SUPPLIER_SEARCH_MAX_LENGTH = 200

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
  loadOptions: OptionLoader<SupplierSuggestion>
  /** False until the session has an active scope; callers disable the control. */
  scopeReady: boolean
}

/**
 * Scope-bound supplier suggestions for the receiving petal.
 *
 * AsyncSelect owns debouncing (300ms) and the two-character trigger; this
 * loader guards both defensively and stays inert until a session scope is
 * active, so the petal never offers suppliers outside the active scope.
 *
 * Each suggestion carries the supplier NAME the draft write stores as
 * `supplier_ref`; the combobox commits that name, and a typed name binds the
 * same way whether or not it appears in the suggestions.
 *
 * Suppliers are operational (not master) data — an active count session may
 * hide them — so responses use the operational stale window.
 */
export function useReceivingSuppliersLoader(): ReceivingSuppliersLoaderResult {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const scopeReady = activeScopeCacheKey !== undefined

  const loadOptions = useCallback<OptionLoader<SupplierSuggestion>>(
    async (query) => {
      // Capped at the contract's maximum: a longer query is a guaranteed 400.
      const trimmed = query.trim().slice(0, SUPPLIER_SEARCH_MAX_LENGTH)
      if (activeScopeCacheKey === undefined || trimmed.length < SUPPLIER_SEARCH_MIN_LENGTH) {
        return []
      }
      const suppliers = await queryClient.fetchQuery({
        queryKey: receivingQueryKeys.suppliers(activeScopeCacheKey, trimmed),
        queryFn: () => receivingService.searchReceivingSuppliers(trimmed),
        staleTime: OPERATIONAL_STALE_TIME,
      })
      return suppliers.map((supplier) => ({ value: supplier.name, label: supplier.name }))
    },
    [activeScopeCacheKey, queryClient],
  )

  return { loadOptions, scopeReady }
}
