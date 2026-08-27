import { describe, expect, it } from 'vitest'

import { createAuditLog, createAuditLogEntry } from '@/test/msw/factories'

import {
  REDACTED_AUDIT_VALUE_AR,
  getAuditActionDisplay,
  getAuditFieldDisplay,
  toAuditEntityFilter,
  toAuditEntryDisplay,
} from './audit-display'

describe('audit display mapping', () => {
  it('renders the approved Arabic placeholder without inspecting a redacted raw value', () => {
    const display = toAuditEntryDisplay(
      createAuditLogEntry({
        newValue: 'never display',
        oldValue: 'never display',
        redacted: true,
        redactionReasonAr: 'بيانات حساسة',
      }),
    )

    expect(display).toMatchObject({
      newValue: REDACTED_AUDIT_VALUE_AR,
      oldValue: REDACTED_AUDIT_VALUE_AR,
      redacted: true,
      redactionReasonAr: 'بيانات حساسة',
    })
  })

  it('translates only approved action codes and preserves unknown action and field codes raw', () => {
    expect(getAuditActionDisplay('Post')).toEqual({ isKnown: true, text: 'ترحيل' })
    expect(getAuditActionDisplay('FutureAction')).toEqual({ isKnown: false, text: 'FutureAction' })
    expect(getAuditFieldDisplay('unknownField')).toEqual({ isKnown: false, text: 'unknownField' })
  })

  it('creates entity-only correlation filters without deriving audit content from current state', () => {
    const auditLog = createAuditLog()

    expect(toAuditEntityFilter(auditLog)).toEqual({
      entityId: auditLog.entityId,
      entityType: auditLog.entityType,
    })
  })
})
