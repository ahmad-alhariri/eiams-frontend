import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { reportsService } from '@/modules/reports/services/reports.service'
import type {
  ListAssetReportQuery,
  ListCountAdjustmentReportQuery,
  ListDashboardReportQuery,
  ListInventoryReportQuery,
  ListOperationalDocumentsReportQuery,
} from '@/modules/reports/types/reports.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const REPORTS_RESOURCE = 'reports'

export const reportsQueryKeys = {
  inventory: (scope: ScopeCacheKey, query: ListInventoryReportQuery) =>
    queryKeys.scoped(scope, REPORTS_RESOURCE, 'inventory', query),
  assets: (scope: ScopeCacheKey, query: ListAssetReportQuery) =>
    queryKeys.scoped(scope, REPORTS_RESOURCE, 'assets', query),
  countAdjustment: (scope: ScopeCacheKey, query: ListCountAdjustmentReportQuery) =>
    queryKeys.scoped(scope, REPORTS_RESOURCE, 'countAdjustment', query),
  documents: (scope: ScopeCacheKey, query: ListOperationalDocumentsReportQuery) =>
    queryKeys.scoped(scope, REPORTS_RESOURCE, 'documents', query),
  dashboard: (scope: ScopeCacheKey, query: ListDashboardReportQuery) =>
    queryKeys.scoped(scope, REPORTS_RESOURCE, 'dashboard', query),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

const EMPTY_QUERY = {} as const

/**
 * Server-paginated inventory balance report. Scope-keyed, OPERATIONAL stale
 * time (D-RPT-01 §"Scope and caching"); the page resets `pageIndex` to 0 on
 * any allowed filter change before invoking this hook.
 */
export function useInventoryReportQuery(query: ListInventoryReportQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(REPORTS_RESOURCE, 'inventory', query)
        : reportsQueryKeys.inventory(scope, query),
    queryFn: () => reportsService.getInventoryReport(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Server-paginated asset & custody report. */
export function useAssetReportQuery(query: ListAssetReportQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(REPORTS_RESOURCE, 'assets', query)
        : reportsQueryKeys.assets(scope, query),
    queryFn: () => reportsService.getAssetReport(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Server-paginated count & adjustment report. */
export function useCountAdjustmentReportQuery(query: ListCountAdjustmentReportQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(REPORTS_RESOURCE, 'countAdjustment', query)
        : reportsQueryKeys.countAdjustment(scope, query),
    queryFn: () => reportsService.getCountAdjustmentReport(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Server-paginated operational documents report. */
export function useOperationalDocumentsReportQuery(
  query: ListOperationalDocumentsReportQuery = EMPTY_QUERY,
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(REPORTS_RESOURCE, 'documents', query)
        : reportsQueryKeys.documents(scope, query),
    queryFn: () => reportsService.getOperationalDocumentsReport(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Dashboard report — KPI cards + trend/distribution series (D-RPT-02).
 * Singleton response, scope-keyed cache. Falls back to empty series when
 * data is not yet available (server handles empty/null series per D-RPT-02 §5).
 */
export function useDashboardReportQuery(query: ListDashboardReportQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(REPORTS_RESOURCE, 'dashboard', query)
        : reportsQueryKeys.dashboard(scope, query),
    queryFn: () => reportsService.getDashboardReport(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
