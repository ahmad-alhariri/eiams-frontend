import type { AuditLog, AuditLogEntry } from '@/shared/types/generated/eiams-v1'

import type { AuditEntityFilter } from '@/modules/audit/types/audit.types'

export const REDACTED_AUDIT_VALUE_AR = 'قيمة محجوبة'

/**
 * Arabic label per audited action.
 *
 * Keyed on the wire action string. An action absent here is not an error:
 * `getAuditActionDisplay` reports `isKnown: false` and falls back to the raw
 * string, so a newly added backend action degrades honestly instead of
 * rendering a blank cell.
 *
 * `SetActiveScope` was removed here with the rest of the withdrawn scope
 * switching (D-SRS-01, RESOLUTION-015, `eiams-frontend-z34j`). It was a label
 * for an operation the backend has never emitted — `Domain/AuditLogs/AuditActions.cs`
 * is a closed vocabulary with no such member and a grep of the backend returns
 * zero hits — so it advertised a capability the system does not have.
 */
const AUDIT_ACTION_LABELS_AR: Readonly<Record<string, string>> = {
  Assign: 'تكليف',
  Cancel: 'إلغاء',
  Close: 'إغلاق',
  Complete: 'إتمام',
  Create: 'إنشاء',
  Delete: 'حذف',
  DeleteAttachment: 'حذف المرفق',
  Dispose: 'إتلاف',
  Login: 'تسجيل الدخول',
  Logout: 'تسجيل الخروج',
  Post: 'ترحيل',
  Reject: 'رفض',
  Return: 'إرجاع',
  Reverse: 'عكس',
  Revise: 'إعادة إلى المسودة',
  Start: 'بدء',
  Submit: 'إرسال',
  Transfer: 'نقل',
  Update: 'تحديث',
  Upload: 'رفع مرفق',
}

export interface AuditCodeDisplay {
  readonly isKnown: boolean
  readonly text: string
}

export interface AuditEntryDisplay {
  readonly entryId: string
  readonly field: AuditCodeDisplay
  readonly newValue: string | null
  readonly oldValue: string | null
  readonly redacted: boolean
  readonly redactionReasonAr: string | null
}

/**
 * Produces a display-safe label for an audit action. Unratified codes remain
 * raw so the caller can render them in a code-styled element rather than
 * guessing an Arabic translation.
 */
export function getAuditActionDisplay(action: string): AuditCodeDisplay {
  const labelAr = AUDIT_ACTION_LABELS_AR[action]
  return labelAr === undefined ? { isKnown: false, text: action } : { isKnown: true, text: labelAr }
}

/**
 * The current generated contract has no `fieldLabelAr`; therefore all field
 * names remain raw contract codes until the approved OpenAPI increment lands.
 */
export function getAuditFieldDisplay(fieldName: string): AuditCodeDisplay {
  return { isKnown: false, text: fieldName }
}

/**
 * Applies the approved server redaction projection at the display boundary.
 * It intentionally does not inspect old/new values when `redacted` is true.
 */
export function toAuditEntryDisplay(entry: AuditLogEntry): AuditEntryDisplay {
  const hidden = entry.redacted
  return {
    entryId: entry.entryId,
    field: getAuditFieldDisplay(entry.fieldName),
    newValue: hidden ? REDACTED_AUDIT_VALUE_AR : (entry.newValue ?? null),
    oldValue: hidden ? REDACTED_AUDIT_VALUE_AR : (entry.oldValue ?? null),
    redacted: hidden,
    redactionReasonAr: entry.redactionReasonAr ?? null,
  }
}

/** Builds the only supported correlation filter for an entity's audit history. */
export function toAuditEntityFilter(
  auditLog: Pick<AuditLog, 'entityId' | 'entityType'>,
): AuditEntityFilter {
  return { entityId: auditLog.entityId, entityType: auditLog.entityType }
}
