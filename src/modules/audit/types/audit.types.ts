import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived, server-side filters for the immutable audit header list. */
export type ListAuditLogsQuery = NonNullable<operations['listAuditLogs']['parameters']['query']>

/** Stable entity correlation used to open its audit history without a client join. */
export type AuditEntityFilter = Required<Pick<ListAuditLogsQuery, 'entityId' | 'entityType'>>
