import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { custodyService } from '@/modules/custody/services/custody.service'
import type { AssetCustody } from '@/shared/types/generated/eiams-v1'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

/**
 * Single custody row fetch for the detail page (e19-t04). The contract has no
 * `GET /custodies/{id}`, so this reuses the scoped list with a page-size of
 * one and resolves client-side — acceptable at registry scale and replaced by
 * a dedicated endpoint when the backend admits one.
 */
export function useCustodyRowQuery(custodyId: string | undefined) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey: ['custody', 'row', scope.activeScopeCacheKey, custodyId] as const,
    queryFn: async () => {
      const page = await custodyService.listCustodies({
        pageIndex: 0,
        pageSize: 100,
        status: 'Active',
      })
      // The custody detail page renders Asset-subject rows only (PRD 12.8);
      // Material/TrackedUnit rows are excluded from this view.
      const found = page.items.find(
        (item): item is AssetCustody & { subjectType: 'Asset' } =>
          item.custodyId === custodyId && 'assetNumber' in item,
      )
      return found ?? null
    },
    enabled: scope.activeScopeCacheKey !== undefined && custodyId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
