import { describe, expect, it } from 'vitest'

import { isDocumentMutable, documentReadOnlyReasonAr } from '@/shared/documents/document-read-only'
import { getActionPermissionCode } from '@/shared/documents/use-document-permissions'
import { approvedGrant } from '@/test/rbac-role-fixture'
import type { DocumentStatus } from '@/shared/types/generated/eiams-v1'

/**
 * Attachment authorization regression (e24-t06, D-ATT-01 + D-RBAC-01 rule 3).
 *
 * ## The defect this locks out
 *
 * `document-detail-page.tsx` derived the attachment panel's `readOnly` flag
 * from the document *status* alone. A session holding only `document.view`
 * therefore saw live upload and remove controls on a Draft, and the request
 * that followed failed server-side with a 403 — the exact "guard only in the UI
 * is not a guard" outcome D-RBAC-01 rule 3 rules out. The flag now also
 * requires `document.update`, which is what `UploadAttachment` maps to.
 *
 * These cases pin the two halves of that condition so neither can regress:
 * the status half (Draft is the only mutable state) and the permission half
 * (`document.update` is required regardless of status).
 */

const DRAFT: DocumentStatus = 'Draft'

/** Mirrors the composition in document-detail-page.tsx. */
function attachmentsReadOnly({
  status,
  hasUpdate,
  hasMutationProps = true,
}: {
  status: DocumentStatus | undefined
  hasUpdate: boolean
  hasMutationProps?: boolean
}): boolean {
  return !hasMutationProps || !isDocumentMutable(status) || !hasUpdate
}

describe('status half of the attachment gate', () => {
  it('treats a Draft as the only mutable state', () => {
    expect(isDocumentMutable(DRAFT)).toBe(true)
    for (const status of ['Submitted', 'Rejected', 'Posted', 'Reversed', 'Cancelled'] as const) {
      expect(isDocumentMutable(status), status).toBe(false)
    }
  })

  it('explains every read-only status in Arabic and stays silent for a Draft', () => {
    expect(documentReadOnlyReasonAr(DRAFT)).toBeNull()
    expect(documentReadOnlyReasonAr(undefined)).toBeNull()
    for (const status of ['Submitted', 'Rejected', 'Posted', 'Reversed', 'Cancelled'] as const) {
      const reason = documentReadOnlyReasonAr(status)
      expect(reason, status).toBeTruthy()
      expect(reason).toMatch(/[؀-ۿ]/)
    }
  })
})

describe('permission half of the attachment gate', () => {
  it('maps attachment upload to document.update', () => {
    expect(getActionPermissionCode('UploadAttachment')).toBe('document.update')
  })

  it('hides upload and remove for a view-only session on a Draft', () => {
    // The regression: this used to be editable because status alone was checked.
    expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: false })).toBe(true)
  })

  it('hides upload and remove once the document leaves Draft, even with update rights', () => {
    for (const status of ['Submitted', 'Posted', 'Reversed', 'Cancelled'] as const) {
      expect(attachmentsReadOnly({ status, hasUpdate: true }), status).toBe(true)
    }
  })

  it('allows upload and remove only for an updater on a Draft', () => {
    expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: true })).toBe(false)
  })

  it('keeps the panel read-only when no mutation wiring was supplied', () => {
    expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: true, hasMutationProps: false })).toBe(
      true,
    )
  })
})

describe('the gate matches the approved role sets', () => {
  it('lets a keeper edit attachments on a Draft', () => {
    const keeper = approvedGrant('WH_KEEPER', 'Warehouse')
    expect(keeper.permissionCodes).toContain('document.update')
    expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: true })).toBe(false)
  })

  it('denies a supervisor-scope manager any attachment write', () => {
    for (const scope of ['Enterprise', 'Site'] as const) {
      const manager = approvedGrant('WH_MGR', scope)
      expect(manager.permissionCodes).not.toContain('document.update')
      expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: false }), scope).toBe(true)
    }
  })

  it('denies an administrator any attachment write despite full structural rights', () => {
    const admin = approvedGrant('SYSTEM_ADMIN', 'Enterprise')
    expect(admin.permissionCodes).not.toContain('document.update')
    expect(attachmentsReadOnly({ status: DRAFT, hasUpdate: false })).toBe(true)
  })

  it('gives an auditor read-only attachments at every scope', () => {
    for (const scope of ['Enterprise', 'Site', 'Warehouse'] as const) {
      const auditor = approvedGrant('AUDITOR', scope)
      expect(auditor.permissionCodes).not.toContain('document.update')
    }
  })
})
