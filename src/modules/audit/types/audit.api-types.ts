/**
 * Handwritten wire contracts for the Audit module (D-INT-02 / ADR-0001).
 *
 * The live audit endpoints answer with FLAT camelCase rows whose property
 * names are the ones the backend's own DTO records carry. The frozen design
 * snapshot (the generated artifact, since deleted) described a DIFFERENT shape —
 * `auditLogId`, `occurredAt`, `occurredBy`, `entityDisplay`, `summaryAr`,
 * `traceId`, and `entries[].entryId / redacted / redactionReasonAr` — and NONE
 * of those names exist on the wire, so nothing here may be typed against the
 * snapshot.
 *
 * Verified against the live API (probe on 2026-10-26) and the backend source:
 * - `Application.AuditLogs.AuditLogListItemResponse` -> `AuditLogHeader`
 *   (`GET /audit-logs`; the list projection carries NO field values at all)
 * - `Application.AuditLogs.AuditLogEntryResponse`    -> `AuditLogEntry`
 * - `Application.AuditLogs.AuditLogDetailsResponse`  -> `AuditLogDetail`
 * - `Web.Api.Controllers.AuditLogs.GetAuditLogsController.GetAuditLogsRequest`
 *   -> the query parameters (see `audit.types.ts`)
 *
 * The property names are pinned against the committed consumer baseline by
 * `src/modules/audit/audit-wire-contract.test.ts`.
 */

/**
 * `GET /audit-logs` row (`AuditLogListItemResponse`).
 *
 * Headers only: the server's list projection carries no field values and no
 * entries, so a list row can never hold a redacted secret.
 *
 * `actionDisplayAr` / `entityTypeDisplayAr` are the server's own Arabic
 * labels; they fall back to the raw code when the action or entity type is
 * outside the server's vocabulary.
 */
export interface AuditLogHeader {
  readonly id: string
  readonly operationId: string
  readonly requestId: string | null
  readonly userId: string | null
  readonly entityType: string
  readonly entityId: string
  readonly aggregateType: string | null
  readonly aggregateId: string | null
  readonly action: string
  readonly commandName: string | null
  readonly createdAtUtc: string
  readonly actionDisplayAr: string | null
  readonly actionDisplayEn: string | null
  readonly entityTypeDisplayAr: string | null
  readonly entityTypeDisplayEn: string | null
}

/**
 * `GET /audit-logs/{auditLogId}` field diff (`AuditLogEntryResponse`).
 *
 * The server redacts at this boundary (`Infrastructure.AuditLogs
 * .AuditRedactionService.RedactEntry`): a sensitive field arrives with
 * `oldValue`/`newValue` already nulled and `isRedacted` set. `redactionReason`
 * is the server's REASON CODE — `CONFIDENTIAL_CREDENTIAL` or
 * `SENSITIVE_SYSTEM_VALUE` (`AuditSensitiveDataPolicy.GetReason`) — not a
 * sentence; the Arabic explanation is the display layer's job.
 */
export interface AuditLogEntry {
  readonly id: string
  readonly fieldName: string
  readonly oldValue: string | null
  readonly newValue: string | null
  readonly isRedacted: boolean
  readonly redactionReason: string | null
  readonly fieldDisplayAr: string | null
  readonly fieldDisplayEn: string | null
}

/**
 * `GET /audit-logs/{auditLogId}` (`AuditLogDetailsResponse`).
 *
 * The header plus the ordered field diff of one audit operation.
 *
 * `summary` is null whenever `isSummaryRedacted` is true: the server withholds
 * a summary whose JSON carries a credential-shaped property
 * (`AuditSensitiveDataPolicy.ContainsSensitiveJsonProperty`).
 */
export interface AuditLogDetail {
  readonly id: string
  readonly operationId: string
  readonly requestId: string | null
  readonly userId: string | null
  readonly entityType: string
  readonly entityId: string
  readonly aggregateType: string | null
  readonly aggregateId: string | null
  readonly action: string
  readonly commandName: string | null
  readonly summary: string | null
  readonly isSummaryRedacted: boolean
  readonly summaryRedactionReason: string | null
  readonly ipAddress: string | null
  readonly createdAtUtc: string
  readonly entries: readonly AuditLogEntry[]
  readonly actionDisplayAr: string | null
  readonly actionDisplayEn: string | null
  readonly entityTypeDisplayAr: string | null
  readonly entityTypeDisplayEn: string | null
}
