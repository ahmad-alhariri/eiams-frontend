import type { AuditLogEntry, AuditLogHeader } from '@/modules/audit/types/audit.api-types'
import type { AuditEntityFilter } from '@/modules/audit/types/audit.types'

export const REDACTED_AUDIT_VALUE_AR = 'قيمة محجوبة'

/**
 * The Arabic sentence shown when the server gives no reason code.
 *
 * D-AUD-02 requires a fixed Arabic sentence rather than an empty gap.
 */
export const DEFAULT_REDACTION_REASON_AR = 'القيمة محجوبة وفق سياسة التدقيق.'

/**
 * Arabic explanation per server redaction code.
 *
 * The wire carries a CODE (`AuditSensitiveDataPolicy.GetReason`), not a
 * sentence: `CONFIDENTIAL_CREDENTIAL` for a credential-shaped field and
 * `SENSITIVE_SYSTEM_VALUE` for a system value. The sentence is ours to write.
 */
const AUDIT_REDACTION_REASONS_AR: Readonly<Record<string, string>> = {
  CONFIDENTIAL_CREDENTIAL: 'القيمة محجوبة لارتباطها ببيانات اعتماد سرية.',
  SENSITIVE_SYSTEM_VALUE: 'القيمة محجوبة لارتباطها ببيانات نظام حساسة.',
}

/**
 * Arabic label per audited action, used only when the server sent no label.
 *
 * The server owns the label (`AuditRedactionService.GetActionDisplayAr`) and
 * the module prefers it; this table is the fallback for a response that
 * carries none. A code absent from here is not an error: `getAuditActionDisplay`
 * reports `isKnown: false` and falls back to the raw string, so a newly added
 * backend action degrades honestly instead of rendering a blank cell.
 *
 * The keys are EXACTLY the backend's closed vocabulary of emitted actions —
 * `Domain/AuditLogs/AuditActions.cs` declares 24 constants and no others — and
 * no name the server never sends. The Arabic follows the server's own label
 * table (`Infrastructure/AuditLogs/AuditRedactionService.cs`) wherever it has
 * one for the same action.
 *
 * The names this table used to carry and the server never emits (`Login`,
 * `Revise`, `Transfer`, `Return`, `Dispose`, `DeleteAttachment`, `Upload`)
 * were document-lifecycle actions or operations the backend has no member for,
 * so they advertised a capability the audit trail does not have.
 */
export const AUDIT_ACTION_LABELS_AR: Readonly<Record<string, string>> = {
  Activate: 'تفعيل',
  Add: 'إضافة',
  Assign: 'تسليم عهدة',
  Authenticate: 'تسجيل دخول',
  Cancel: 'إلغاء',
  Close: 'إغلاق',
  Complete: 'إتمام',
  Create: 'إنشاء',
  Deactivate: 'تعطيل',
  Delete: 'حذف',
  Grant: 'منح',
  Logout: 'تسجيل خروج',
  Move: 'نقل',
  Post: 'ترحيل',
  RecordActual: 'تسجيل الكمية الفعلية',
  Reject: 'رفض',
  Remove: 'إزالة',
  ReturnToDraft: 'إعادة للمسودة',
  Reverse: 'عكس',
  Revoke: 'سحب',
  Start: 'بدء',
  Submit: 'إرسال للتدقيق',
  TokenRefresh: 'تجديد الجلسة',
  Update: 'تعديل',
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
 * Produces a display-safe label for an audit action.
 *
 * The server's own Arabic label wins when it carries one; an unratified code
 * is reported as `isKnown: false` and rendered raw, so the caller can show it
 * in a code-styled element instead of guessing an Arabic translation.
 */
export function getAuditActionDisplay(
  action: string,
  serverLabelAr?: string | null,
): AuditCodeDisplay {
  const label = serverLabelAr || AUDIT_ACTION_LABELS_AR[action]
  if (label === undefined || label === action) {
    return { isKnown: false, text: action }
  }
  return { isKnown: true, text: label }
}

/**
 * Produces a display-safe label for an audited field.
 *
 * The live contract carries `fieldDisplayAr` — the server's Arabic label for
 * the field. The server echoes the raw field name when the field is outside
 * its vocabulary, and that echo is how an unratified field stays raw.
 */
export function getAuditFieldDisplay(
  fieldName: string,
  serverLabelAr?: string | null,
): AuditCodeDisplay {
  const label = serverLabelAr || null
  if (label === null || label === fieldName) {
    return { isKnown: false, text: fieldName }
  }
  return { isKnown: true, text: label }
}

/**
 * Applies the approved server redaction projection at the display boundary.
 *
 * It intentionally does not inspect old/new values when `isRedacted` is true —
 * the service has already nulled them, and a redacted entry never carries a
 * value to show.
 */
export function toAuditEntryDisplay(entry: AuditLogEntry): AuditEntryDisplay {
  const hidden = entry.isRedacted
  return {
    entryId: entry.id,
    field: getAuditFieldDisplay(entry.fieldName, entry.fieldDisplayAr),
    newValue: hidden ? REDACTED_AUDIT_VALUE_AR : (entry.newValue ?? null),
    oldValue: hidden ? REDACTED_AUDIT_VALUE_AR : (entry.oldValue ?? null),
    redacted: hidden,
    redactionReasonAr: hidden ? getRedactionReasonAr(entry.redactionReason) : null,
  }
}

/** The Arabic sentence for a server redaction code, or the fixed fallback. */
function getRedactionReasonAr(reason: string | null): string {
  if (reason === null) {
    return DEFAULT_REDACTION_REASON_AR
  }
  return AUDIT_REDACTION_REASONS_AR[reason] ?? DEFAULT_REDACTION_REASON_AR
}

/** Builds the only supported correlation filter for an entity's audit history. */
export function toAuditEntityFilter(
  auditLog: Pick<AuditLogHeader, 'entityId' | 'entityType'>,
): AuditEntityFilter {
  return { entityId: auditLog.entityId, entityType: auditLog.entityType }
}
