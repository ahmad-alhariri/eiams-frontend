import { describe, expect, it } from 'vitest'

import type { AuditLogEntry, AuditLogHeader } from '@/modules/audit/types/audit.api-types'

import {
  AUDIT_ACTION_LABELS_AR,
  DEFAULT_REDACTION_REASON_AR,
  REDACTED_AUDIT_VALUE_AR,
  getAuditActionDisplay,
  getAuditFieldDisplay,
  toAuditEntityFilter,
  toAuditEntryDisplay,
} from './audit-display'

/**
 * The backend's closed action vocabulary, one entry per constant declared by
 * `Domain/AuditLogs/AuditActions.cs` (24 constants, no others).
 */
const BACKEND_AUDIT_ACTIONS = [
  'Activate',
  'Add',
  'Assign',
  'Authenticate',
  'Cancel',
  'Close',
  'Complete',
  'Create',
  'Deactivate',
  'Delete',
  'Grant',
  'Logout',
  'Move',
  'Post',
  'RecordActual',
  'Reject',
  'Remove',
  'ReturnToDraft',
  'Reverse',
  'Revoke',
  'Start',
  'Submit',
  'TokenRefresh',
  'Update',
] as const

/** Names the frontend used to carry and the server never emits. */
const REMOVED_AUDIT_ACTIONS = [
  'DeleteAttachment',
  'Dispose',
  'Login',
  'Return',
  'Revise',
  'Transfer',
  'Upload',
] as const

const ENTRY: AuditLogEntry = {
  id: 'redacted-entry',
  fieldName: 'passwordHash',
  oldValue: 'never display',
  newValue: 'never display',
  isRedacted: true,
  redactionReason: 'CONFIDENTIAL_CREDENTIAL',
  fieldDisplayAr: 'passwordHash',
  fieldDisplayEn: 'passwordHash',
}

const HEADER: AuditLogHeader = {
  id: '00000000-0000-4000-8000-0000000000c8',
  operationId: '00000000-0000-4000-8000-0000000000c9',
  requestId: null,
  userId: null,
  entityType: 'WarehouseDocument',
  entityId: '00000000-0000-4000-8000-0000000000ca',
  aggregateType: null,
  aggregateId: null,
  action: 'Update',
  commandName: null,
  createdAtUtc: '2026-08-20T10:00:00.000Z',
  actionDisplayAr: 'تعديل',
  actionDisplayEn: 'Update',
  entityTypeDisplayAr: 'مستند مستودعي',
  entityTypeDisplayEn: 'WarehouseDocument',
}

describe('audit display mapping', () => {
  it('renders the approved Arabic placeholder without inspecting a redacted raw value', () => {
    const display = toAuditEntryDisplay(ENTRY)

    expect(display).toMatchObject({
      entryId: 'redacted-entry',
      newValue: REDACTED_AUDIT_VALUE_AR,
      oldValue: REDACTED_AUDIT_VALUE_AR,
      redacted: true,
      redactionReasonAr: 'القيمة محجوبة لارتباطها ببيانات اعتماد سرية.',
    })
  })

  it('translates the server redaction code and falls back to the fixed sentence', () => {
    expect(
      toAuditEntryDisplay({ ...ENTRY, redactionReason: 'SENSITIVE_SYSTEM_VALUE' })
        .redactionReasonAr,
    ).toBe('القيمة محجوبة لارتباطها ببيانات نظام حساسة.')
    expect(toAuditEntryDisplay({ ...ENTRY, redactionReason: null }).redactionReasonAr).toBe(
      DEFAULT_REDACTION_REASON_AR,
    )
    expect(
      toAuditEntryDisplay({ ...ENTRY, redactionReason: 'FUTURE_CODE' }).redactionReasonAr,
    ).toBe(DEFAULT_REDACTION_REASON_AR)
  })

  it('prefers the server Arabic label and keeps an unratified code raw', () => {
    expect(getAuditActionDisplay('Update', 'تعديل')).toEqual({ isKnown: true, text: 'تعديل' })
    expect(getAuditActionDisplay('Post')).toEqual({ isKnown: true, text: 'ترحيل' })
    expect(getAuditActionDisplay('FutureAction')).toEqual({
      isKnown: false,
      text: 'FutureAction',
    })
    // The server echoes the raw code for a vocabulary it does not know.
    expect(getAuditActionDisplay('ResetSession', 'ResetSession')).toEqual({
      isKnown: false,
      text: 'ResetSession',
    })
    expect(getAuditFieldDisplay('totalAmount', 'المبلغ الإجمالي')).toEqual({
      isKnown: true,
      text: 'المبلغ الإجمالي',
    })
    expect(getAuditFieldDisplay('last_login_utc', 'last_login_utc')).toEqual({
      isKnown: false,
      text: 'last_login_utc',
    })
    expect(getAuditFieldDisplay('last_login_utc')).toEqual({
      isKnown: false,
      text: 'last_login_utc',
    })
  })

  it('labels exactly the backend action vocabulary and nothing the server never sends', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS_AR).sort()).toEqual([...BACKEND_AUDIT_ACTIONS].sort())

    for (const action of BACKEND_AUDIT_ACTIONS) {
      expect(getAuditActionDisplay(action)).toEqual({
        isKnown: true,
        text: AUDIT_ACTION_LABELS_AR[action],
      })
    }

    for (const action of REMOVED_AUDIT_ACTIONS) {
      expect(getAuditActionDisplay(action)).toEqual({ isKnown: false, text: action })
    }
  })

  it('creates entity-only correlation filters without deriving audit content from current state', () => {
    expect(toAuditEntityFilter(HEADER)).toEqual({
      entityId: HEADER.entityId,
      entityType: HEADER.entityType,
    })
  })
})
