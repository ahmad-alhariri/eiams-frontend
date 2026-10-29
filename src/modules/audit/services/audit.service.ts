import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { apiTransport } from '@/shared/api/transport'
import { pathWithId } from '@/shared/services/api-path'

import type {
  AuditLogDetail,
  AuditLogEntry,
  AuditLogHeader,
} from '@/modules/audit/types/audit.api-types'
import type { ListAuditLogsQuery } from '@/modules/audit/types/audit.types'

const AUDIT_LOGS_PATH = '/audit-logs'
const AUDIT_LOG_PATH = '/audit-logs/{auditLogId}'

/**
 * Sends a list query through the ONE shared pagination clamp.
 *
 * `page` is ONE-based on both sides (`useServerPagination` and the wire
 * `PaginationQueryParameters.Page` is `Range(1, 21474836)`), so the helper
 * only clamps it. The previous `pageIndex` was forwarded verbatim, which put
 * `pageIndex=0` on the wire — a parameter the server does not bind, so every
 * audit list stayed on its first page.
 */
function withWirePagination<TQuery extends { readonly page?: number; readonly pageSize?: number }>(
  query: TQuery,
): Record<string, string | number | boolean | undefined> {
  const { page, pageSize, ...filters } = query
  return {
    ...toWireOneBasedPaginationParams({ page, pageSize }),
    ...(filters as Record<string, string | number | boolean | undefined>),
  }
}

/**
 * Keeps a withheld value out of every client-owned projection.
 *
 * The server already redacts (`AuditRedactionService.RedactEntry` nulls the
 * values of a sensitive field), so this is the belt to that suspenders: a
 * malformed or leaky server response must not put the value into the React
 * Query cache, where the UI would read it before the display layer ever sees
 * it. The redacted entry keeps its identity and its reason, and nothing else.
 */
export function sanitizeAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  if (!entry.isRedacted) {
    return entry
  }

  return {
    id: entry.id,
    fieldName: entry.fieldName,
    oldValue: null,
    newValue: null,
    isRedacted: true,
    redactionReason: entry.redactionReason ?? null,
    fieldDisplayAr: entry.fieldDisplayAr ?? null,
    fieldDisplayEn: entry.fieldDisplayEn ?? null,
  }
}

/**
 * Applies the same boundary to the operation summary.
 *
 * `isSummaryRedacted` marks a summary the server withheld because its JSON
 * carried a credential-shaped property; the summary itself must not survive
 * into the cache.
 */
function sanitizeAuditDetail(auditLog: AuditLogDetail): AuditLogDetail {
  return {
    ...auditLog,
    summary: auditLog.isSummaryRedacted ? null : auditLog.summary,
    entries: auditLog.entries.map(sanitizeAuditEntry),
  }
}

export interface AuditService {
  listAuditLogs: (query: ListAuditLogsQuery) => Promise<ApiPage<AuditLogHeader>>
  getAuditLog: (auditLogId: string) => Promise<AuditLogDetail>
}

/** Contract-only reads for the append-only, server-owned audit ledger. */
export function createAuditService(transport: ApiTransport): AuditService {
  return {
    async listAuditLogs(query) {
      // The list projection is headers-only by contract: `AuditLogListItemResponse`
      // carries no field values, so there is nothing to redact on this read.
      return transport.requestPage<AuditLogHeader>({
        path: AUDIT_LOGS_PATH,
        method: 'GET',
        query: withWirePagination(query),
      })
    },
    async getAuditLog(auditLogId) {
      const response = await transport.request<AuditLogDetail>({
        path: pathWithId(AUDIT_LOG_PATH, '{auditLogId}', auditLogId),
        method: 'GET',
      })
      return sanitizeAuditDetail(response)
    },
  }
}

export const auditService = createAuditService(apiTransport)
