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
 * - `undefined` balance → lookup still loading, the material is not selected
 *   yet, or the lookup FAILED; the caller renders "unknown" (never a block)
 *   exactly like {@link import('@/shared/documents/document-policy-gates')}
 *   treats a null `availableBalance`.
 * - a material with no balance row maps to `null` (server says no stock is
 *   held) which downstream gates treat as 0-available.
 * - a material whose lookup FAILED and has no cached row is deliberately left
 *   OUT of the map, i.e. `undefined` and never `null` (e24-t10 / B3). `null`
 *   is a factual claim — "the server says no stock is held" — and a failed read
 *   is not such a claim; mapping an error to `null` made the issue and
 *   transfer forms print `الكمية المطلوبة … تتجاوز الرصيد المتاح (0)` about
 *   inventory the server never answered for, and blocked Save on that fiction.
 *   `isError` lets the caller say what actually happened and offer a retry.
 * - a lookup that fails on a background refetch but still holds a cached row
 *   keeps serving that row and does not report `isError`, matching the
 *   e24-t09 F-1 precedent (docs/concurrency-partial-failure-verification.md):
 *   a failed background refetch over cached data must not turn a known balance
 *   into an unexplained block, which would weaken AGENTS.md rule 3.
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
  /**
   * True when at least one lookup failed and holds no cached row, so this map
   * says nothing about that material. Fails CLOSED at the caller's save action
   * while never claiming a quantity the server did not report.
   */
  isError: boolean
  /** Refetch only the lookups that failed. */
  retry: () => void
}

const EMPTY_MAP: ReadonlyMap<string, number | null> = new Map()

const NOOP_RETRY = (): void => undefined

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
              page: 0,
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
      return { balanceByMaterialId: EMPTY_MAP, isLoading: false, isError: false, retry: NOOP_RETRY }
    }

    const balanceByMaterialId = new Map<string, number | null>()
    let isLoading = false
    let isError = false
    for (let index = 0; index < distinctMaterialIds.length; index += 1) {
      const query = queries[index]
      const materialId: string = distinctMaterialIds[index] ?? ''
      if (materialId === '' || query === undefined) continue
      if (query.isLoading) {
        isLoading = true
        continue
      }
      // A failed lookup with nothing cached stays OUT of the map (see the
      // module docstring): `undefined` means unknown, `null` would be a
      // fabricated "no stock held".
      if (query.isError && query.data === undefined) {
        isError = true
        continue
      }
      // First matching row wins; the contract filters by exact ids.
      const row = query.data?.items[0]
      balanceByMaterialId.set(materialId, row === undefined ? null : row.quantity)
    }
    const retry = (): void => {
      for (const query of queries) {
        if (query?.isError === true) {
          void query.refetch()
        }
      }
    }
    return { balanceByMaterialId, isLoading, isError, retry }
  }, [activeScopeCacheKey, distinctMaterialIds, queries, warehouseId])
}
