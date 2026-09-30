/**
 * Audit module API types — handwritten contracts for direct backend integration.
 *
 * These types match the backend's actual JSON serialization (field names, shapes,
 * nullability). They replace the generated imports from `@/shared/types/generated/eiams-v1`.
 *
 * Verified against:
 * - Backend C# DTOs in `EIAMS\src\Application\AuditLogs\AuditLogResponses.cs`
 * - Backend query record in `EIAMS\src\Application\AuditLogs\GetAuditLogs\GetAuditLogsQuery.cs`
 * - Generated OpenAPI types (`components.schemas.AuditLog`, `AuditLogEntry`, `AuditLogPage`)
 * - `docs/direct-backend-integration-plan.md` §4.2 (snake_case → camelCase normalization)
 * - `docs/audit-detail-contract-decision.md` D-AUD-02 (redaction policy, action vocabulary)
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Matches backend Guid / OpenAPI Uuid: a lowercased hyphenated UUID string. */
export type Uuid = string

/** Matches backend NamedReference: { id: Uuid, displayName: string } */
export interface NamedReference {
  readonly id: Uuid
  readonly displayName: string
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

/**
 * Wire query parameters for `GET /audit-logs`.
 *
 * Snake_case → camelCase per plan.md §4.2 / pagination.ts:
 *   page_index → pageIndex   (1-based, per plan §5.2)
 *   page_size  → pageSize
 *   date_from   → dateFrom   (ISO 8601 / date-time)
 *   date_to     → dateTo     (ISO 8601 / date-time)
 *
 * Derived from backend `GetAuditLogsQuery`:
 *   UserId?, EntityType?, EntityId?, Action?, FieldName?,
 *   FromUtc?, ToUtc?, Search?, Page, PageSize
 */
export interface ListAuditLogsQuery {
  readonly pageIndex?: number
  readonly pageSize?: number
  readonly entityType?: string
  readonly entityId?: Uuid
  readonly action?: string
  readonly fieldName?: string
  readonly dateFrom?: string
  readonly dateTo?: string
  readonly search?: string
}

// ---------------------------------------------------------------------------
// Response types — list projection
// ---------------------------------------------------------------------------

/**
 * Matches backend `AuditLogListItemResponse` (list header projection).
 *
 * Returned inside `AuditLogPage.items` for `GET /audit-logs`.
 * Header-only: no `entries` array.
 */
export interface AuditLog {
  readonly auditLogId: Uuid
  readonly operationId: Uuid
  readonly requestId: string | null
  readonly userId: Uuid | null
  readonly entityType: string
  readonly entityId: Uuid
  readonly aggregateType: string | null
  readonly aggregateId: Uuid | null
  readonly action: string
  readonly commandName: string | null
  readonly createdAtUtc: string
  readonly actionDisplayAr: string | null
  readonly actionDisplayEn: string | null
  readonly entityTypeDisplayAr: string | null
  readonly entityTypeDisplayEn: string | null
}

// ---------------------------------------------------------------------------
// Response types — field-diff entry
// ---------------------------------------------------------------------------

/**
 * Matches backend `AuditLogEntryResponse`.
 *
 * Per D-AUD-02:
 * - `oldValue`/`newValue` are absent (null) when `redacted` is true.
 * - `redactionReasonAr` is the server-provided Arabic explanation.
 * - `fieldDisplayAr`/`fieldDisplayEn` carry server-provided Arabic labels.
 */
export interface AuditLogEntry {
  readonly entryId: Uuid
  readonly fieldName: string
  readonly oldValue: string | null
  readonly newValue: string | null
  readonly redacted: boolean
  readonly redactionReasonAr: string | null
  readonly fieldDisplayAr: string | null
  readonly fieldDisplayEn: string | null
}

// ---------------------------------------------------------------------------
// Response types — detail projection
// ---------------------------------------------------------------------------

/**
 * Matches backend `AuditLogDetailsResponse` (`GET /audit-logs/{auditLogId}`).
 *
 * Header + ordered field-diff entries for one audit operation.
 */
export interface AuditLogDetail {
  readonly auditLogId: Uuid
  readonly operationId: Uuid
  readonly requestId: string | null
  readonly userId: Uuid | null
  readonly entityType: string
  readonly entityId: Uuid
  readonly aggregateType: string | null
  readonly aggregateId: Uuid | null
  readonly action: string
  readonly commandName: string | null
  readonly summary: string | null
  readonly isSummaryRedacted: boolean
  readonly summaryRedactionReason: string | null
  readonly ipAddress: string | null
  readonly createdAtUtc: string
  readonly entries: ReadonlyArray<AuditLogEntry>
  readonly actionDisplayAr: string | null
  readonly actionDisplayEn: string | null
  readonly entityTypeDisplayAr: string | null
  readonly entityTypeDisplayEn: string | null
}

// ---------------------------------------------------------------------------
// Paginated envelope
// ---------------------------------------------------------------------------

/**
 * Matches backend paginated response shape + OpenAPI `AuditLogPage`.
 *
 * `items` carries the list projection (`AuditLog` header-only records).
 * `meta` follows the backend `PageMeta` contract (pageIndex-based, 0-based index).
 */
export interface AuditLogPage {
  readonly items: ReadonlyArray<AuditLog>
  readonly meta: PageMeta
}

/**
 * Matches backend `PageMeta` (OpenAPI `components.schemas.PageMeta`).
 *
 * pageIndex is 0-based per OpenAPI spec (`minimum: 0`); matches other
 * handwritten module types (`organization.api-types.ts`, `catalog.api-types.ts`).
 */
export interface PageMeta {
  readonly pageIndex: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
}
