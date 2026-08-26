import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { inventoryQueryKeys } from '@/modules/inventory/hooks/use-inventory-queries'
import { inventoryService } from '@/modules/inventory/services/inventory.service'
import type { ListInventoryBalancesQuery } from '@/modules/inventory/types/inventory.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

/**
 * Live per-line balance lookup for outbound document forms (e16-t04).
 *
 * Issue (and later Transfer) must show the available balance per selected
 * line and block over-balance drafts before submission (AGENTS.md rules 3/5;
 * negative stock is blocked in v1). The v1 contract exposes balances only as
 * a filtered list read (`/inventory/balances?warehouseId&materialId`), so the
 * hook fans one operational query per DISTINCT selected material and joins
 * the results into a `materialId → quantity` map.
 *
 * Semantics mirror the server-side policy surface:
 * - `undefined` balance → lookup still loading or material not selected yet;
 *   the caller renders "unknown" (never a block) exactly like
 *   {@link import('@/shared/documents/document-policy-gates')} treats a null
 *   `availableBalance`.
 * - a material with no balance row maps to `null` (server says no stock is
 *   held) which downstream gates treat as 0-available.
 *
 * Scope safety: keys ride the shared scoped inventory cache so a scope switch
 * invalidates every lookup together with the rest of the operational data.
 */
export type IssueLineBalanceState = 'loading' | 'ready'

export interface UseIssueLineBalancesResult {
  /** materialId → current warehouse quantity; null when no balance row exists. */
  balanceByMaterialId: ReadonlyMap<string, number | null>
  /** True while at least one distinct-material lookup is in flight. */
  isLoading: boolean
}

const EMPTY_MAP: ReadonlyMap<string, number | null> = new Map()

export function useIssueLineBalances(
  warehouseId: string | undefined,
  materialIds: readonly string[],
): UseIssueLineBalancesResult {
  const { activeScopeCacheKey } = useActiveScopeContext()

  const distinctMaterialIds = useMemo(() => {
    const seen = new Set<string>()
    for (const materialId of materialIds) {
      if (materialId !== '') {
        seen.add(materialId)
      }
    }
    return [...seen]
  }, [materialIds])

  const queries = useQueries({
    queries:
      activeScopeCacheKey === undefined || warehouseId === undefined || warehouseId === ''
        ? []
        : distinctMaterialIds.map((materialId) => {
            const listQuery: ListInventoryBalancesQuery = {
              pageIndex: 0,
              pageSize: 1,
              warehouseId,
              materialId,
            }
            return {
              queryKey: inventoryQueryKeys.balances(activeScopeCacheKey, listQuery),
              queryFn: () => inventoryService.listBalances(listQuery),
              enabled: true,
              staleTime: OPERATIONAL_STALE_TIME,
            }
          }),
  })

  return useMemo(() => {
    if (
      activeScopeCacheKey === undefined ||
      warehouseId === undefined ||
      warehouseId === '' ||
      distinctMaterialIds.length === 0
    ) {
      return { balanceByMaterialId: EMPTY_MAP, isLoading: false }
    }

    const balanceByMaterialId = new Map<string, number | null>()
    let isLoading = false
    for (let index = 0; index < distinctMaterialIds.length; index += 1) {
      const query = queries[index]
      const materialId: string = distinctMaterialIds[index] ?? ''
      if (materialId === '' || query === undefined) continue
      if (query.isLoading) {
        isLoading = true
        continue
      }
      // First matching row wins; the contract filters by exact ids.
      const row = query.data?.items[0]
      balanceByMaterialId.set(materialId, row === undefined ? null : row.quantity)
    }
    return { balanceByMaterialId, isLoading }
  }, [activeScopeCacheKey, distinctMaterialIds, queries, warehouseId])
}
