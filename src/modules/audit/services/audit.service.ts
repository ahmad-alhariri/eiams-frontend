import type { AxiosInstance } from 'axios'

import type { ListAuditLogsQuery } from '@/modules/audit/types/audit.types'
import { apiClient } from '@/shared/services/api.client'
import type {
  AuditLog,
  AuditLogEntry,
  AuditLogPage,
  paths,
} from '@/shared/types/generated/eiams-v1'

const AUDIT_LOGS_PATH = '/audit-logs' satisfies keyof paths
const AUDIT_LOG_PATH = '/audit-logs/{auditLogId}' satisfies keyof paths

function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}

/**
 * Keeps withheld values out of every client-owned projection. The service
 * sanitizes before React Query receives the response, so a malformed server
 * response cannot leave an old/new redacted value in the query cache.
 */
export function sanitizeAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  if (!entry.redacted) {
    return entry
  }

  return {
    entryId: entry.entryId,
    fieldName: entry.fieldName,
    redacted: true,
    redactionReasonAr: entry.redactionReasonAr ?? null,
  }
}

function sanitizeAuditDetail(auditLog: AuditLog): AuditLog {
  return {
    ...auditLog,
    entries: auditLog.entries.map(sanitizeAuditEntry),
  }
}

/**
 * D-AUD-02 defines the list response as headers only. The provisional schema
 * still contains `entries`, so discard them at the API boundary rather than
 * allowing any list-detail values into the query cache.
 */
function sanitizeAuditHeader(auditLog: AuditLog): AuditLog {
  return { ...auditLog, entries: [] }
}

export interface AuditService {
  listAuditLogs: (query: ListAuditLogsQuery) => Promise<AuditLogPage>
  getAuditLog: (auditLogId: string) => Promise<AuditLog>
}

/** Contract-only reads for the append-only, server-owned audit ledger. */
export function createAuditService(client: AxiosInstance): AuditService {
  return {
    async listAuditLogs(query) {
      const response = await client.get<AuditLogPage>(AUDIT_LOGS_PATH, { params: query })
      return {
        ...response.data,
        items: response.data.items.map(sanitizeAuditHeader),
      }
    },
    async getAuditLog(auditLogId) {
      const response = await client.get<AuditLog>(
        pathWithId(AUDIT_LOG_PATH, '{auditLogId}', auditLogId),
      )
      return sanitizeAuditDetail(response.data)
    },
  }
}

export const auditService = createAuditService(apiClient)
