import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { auditService } from '@/modules/audit/services/audit.service'
import type { ListAuditLogsQuery } from '@/modules/audit/types/audit.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const AUDIT_RESOURCE = 'audit'
const EMPTY_QUERY = {} as const

export const auditQueryKeys = {
  logs: (scope: ScopeCacheKey, query: ListAuditLogsQuery) =>
    queryKeys.scoped(scope, AUDIT_RESOURCE, 'logs', query),
  log: (scope: ScopeCacheKey, auditLogId: string) =>
    queryKeys.scoped(scope, AUDIT_RESOURCE, 'logs', auditLogId),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

/** Server-paginated, fixed-order audit headers. */
export function useAuditLogsQuery(query: ListAuditLogsQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(AUDIT_RESOURCE, 'logs', query)
        : auditQueryKeys.logs(scope, query),
    queryFn: () => auditService.listAuditLogs(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** One immutable audit operation and its ordered, server-redacted field diff. */
export function useAuditLogQuery(auditLogId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || auditLogId === undefined
        ? queryKeys.public(AUDIT_RESOURCE, 'logs', auditLogId)
        : auditQueryKeys.log(scope, auditLogId),
    queryFn: () => auditService.getAuditLog(auditLogId ?? ''),
    enabled: scope !== undefined && auditLogId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
