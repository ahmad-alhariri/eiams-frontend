/**
 * Request-side types for the Audit module.
 *
 * The wire response DTOs live in `audit.api-types.ts`; this file holds what
 * the module ASKS the server for.
 */

/**
 * `GET /audit-logs` query — the live parameters and NOTHING else.
 *
 * Verified against `Web.Api.Controllers.AuditLogs.GetAuditLogsController
 * .GetAuditLogsRequest` (bound with `[FromQuery]`) and
 * `Application.AuditLogs.GetAuditLogs.GetAuditLogsQuery`:
 *
 * - `userId`, `entityType`, `entityId`, `action`, `fieldName`, `search`
 * - `fromUtc` / `toUtc` — the date range. The controller binds `DateTimeOffset?
 *   FromUtc` / `ToUtc`; the module used to send `dateFrom` / `dateTo`, which
 *   the server does not bind, so the range filter was silently dropped.
 * - `page` — ONE-based, from `Web.Api.Infrastructure.PaginationQueryParameters`
 *   (`Page` is `[Range(1, MaximumPage)]`). The module used to send `pageIndex`,
 *   which the server does not bind either, so every list stayed on page 1.
 *
 * `entityType` must be one of the server's known entity types and `action` one
 * of `Domain.AuditLogs.AuditActions.All`; the server answers 400 for anything
 * else (`AuditLogQuerySupport.AreGlobalFiltersValid`).
 */
export interface ListAuditLogsQuery {
  readonly userId?: string
  readonly entityType?: string
  readonly entityId?: string
  readonly action?: string
  readonly fieldName?: string
  readonly fromUtc?: string
  readonly toUtc?: string
  readonly search?: string
  readonly page?: number
  readonly pageSize?: number
}

/** Stable entity correlation used to open its audit history without a client join. */
export type AuditEntityFilter = Required<Pick<ListAuditLogsQuery, 'entityId' | 'entityType'>>

/**
 * The date-range rule, mirrored from the server.
 *
 * The server is the only authority — `Application/Abstractions/Filtering/
 * DateRangeLimits.cs` (`IsValid`) — and it answers 400 with
 * «FromUtc and ToUtc must form a half-open range no longer than 366 days.»
 * for anything else. A range is valid only when it carries BOTH bounds, the
 * lower bound is strictly before the upper one, and the span does not exceed
 * `MaximumRange` (366 days).
 *
 * The browser asks with the same rule, because a half-filled range is a
 * normal thing for a user to be in the middle of: sending it turns the filter
 * into a 400 the list cannot explain.
 */

/** The server's `DateRangeLimits.MaximumRange` (`TimeSpan.FromDays(366)`). */
export const AUDIT_MAX_RANGE_DAYS = 366

const MAX_RANGE_MS = AUDIT_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000

/** Which of the two filters a message belongs to. */
export type AuditRangeField = 'from' | 'to'

export type AuditRangeProblem =
  /** The lower bound is missing while the upper one is set. */
  | 'missing-lower-bound'
  /** The upper bound is missing while the lower one is set. */
  | 'missing-upper-bound'
  /** The lower bound is not before the upper one. */
  | 'reversed'
  /** The span is longer than the server's maximum. */
  | 'too-long'

export interface AuditDateRange {
  readonly from: Date | undefined
  readonly to: Date | undefined
}

export interface AuditRangeError {
  /** The filter the message is shown under. */
  readonly field: AuditRangeField
  /** The Arabic message shown under that filter. */
  readonly messageAr: string
}

/**
 * Reports why a range would be refused by the server, or `null` when it is
 * acceptable (both bounds absent, or both present and within the rule).
 *
 * The message always lands on the field the user still has to fix: the bound
 * that is missing, or the upper bound for a range that is inverted or too
 * long — that one has to move for the range to become valid.
 */
export function auditRangeError(range: AuditDateRange): AuditRangeError | null {
  const { from, to } = range
  if (from === undefined && to === undefined) {
    return null
  }
  if (from === undefined) {
    return {
      field: 'from',
      messageAr: 'حدّد «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» معًا.',
    }
  }
  if (to === undefined) {
    return {
      field: 'to',
      messageAr: 'حدّد «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» معًا.',
    }
  }
  const fromMs = from.getTime()
  const toMs = to.getTime()
  if (fromMs >= toMs) {
    return {
      field: 'to',
      messageAr: 'يجب أن يكون «إلى تاريخ الإنشاء» بعد «من تاريخ الإنشاء».',
    }
  }
  if (toMs - fromMs > MAX_RANGE_MS) {
    return {
      field: 'to',
      messageAr: `نطاق «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» لا يتجاوز ${AUDIT_MAX_RANGE_DAYS} يومًا.`,
    }
  }
  return null
}
