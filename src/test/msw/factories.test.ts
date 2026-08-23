import { describe, expect, it } from 'vitest'

import {
  actionsForDocumentStatus,
  createAuthTokenResponse,
  createDocumentActionResult,
  createDocumentAttachment,
  createDocumentPolicy,
  createInventoryBalance,
  createLifecycleEvent,
  createMaterial,
  createPage,
  createPolicyBlocker,
  createProblemDetails,
  createScopeContext,
  createSession,
  createStockMovement,
  createWarehouse,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  fixtureUuid,
  DOCUMENT_TRANSITIONS,
} from '@/test/msw/factories'

describe('contract-derived MSW factories', () => {
  it('creates valid, deterministic UUIDs for fixture identifiers', () => {
    expect(fixtureUuid()).toBe('00000000-0000-4000-8000-000000000001')
    expect(fixtureUuid(16)).toBe('00000000-0000-4000-8000-000000000010')
  })

  it('composes a selected session into the token response and permits typed overrides', () => {
    const scope = createScopeContext({
      scopeType: 'Enterprise',
      scopeId: null,
      displayName: 'الهيئة',
    })
    const session = createSession({
      activeScope: scope,
      availableScopes: [scope],
      permissionCodes: ['audit.view'],
    })
    const response = createAuthTokenResponse({ expiresInSeconds: 60, session })

    expect(response).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 60 })
    expect(response.session.activeScope).toEqual(scope)
    expect(response.session.permissionCodes).toEqual(['audit.view'])
  })

  it('uses the shared v1 paging envelope and derives its totals from items', () => {
    const page = createPage([createWarehouse(), createWarehouse({ warehouseId: fixtureUuid(32) })])

    expect(page.meta).toMatchObject({ pageIndex: 1, pageSize: 20, totalItems: 2, totalPages: 1 })
    expect(page.items).toHaveLength(2)
  })

  it('returns contract-shaped operational entities and problem details', () => {
    const material = createMaterial({ materialKind: 'Asset', requiresAssetNumber: true })
    const balance = createInventoryBalance({
      material: { id: material.materialId, displayName: material.nameAr },
    })
    const movement = createStockMovement({ material: balance.material })
    const problem = createProblemDetails({ status: 409, code: 'conflict.version' })

    expect(balance.material.id).toBe(material.materialId)
    expect(balance.lowStock).toEqual({ state: 'Sufficient', thresholdQuantity: 5 })
    expect(movement).toMatchObject({
      documentReference: 'EIAMS-RCV-2026-0001',
      material: balance.material,
      movementType: 'Receipt',
      quantityDelta: 5,
    })
    expect(material.requiresAssetNumber).toBe(true)
    expect(problem).toMatchObject({ status: 409, code: 'conflict.version' })
  })
})

describe('document-engine MSW factories', () => {
  it('creates a document attachment whose documentId links to the owning document', () => {
    const attachment = createDocumentAttachment({ documentId: fixtureUuid(150) })

    expect(attachment.documentId).toBe(fixtureUuid(150))
    expect(attachment.attachmentType).toBe('SignedOriginal')
    expect(attachment.uploadedBy.id).toBe(fixtureUuid(10))
    expect(attachment.mimeType).toBe('application/pdf')
  })

  it('creates a warehouse document line shaped after the contract DocumentLine', () => {
    const line = createWarehouseDocumentLine({
      material: { materialId: fixtureUuid(60), nameAr: 'حاسوب مكتبي' },
      quantity: 3,
      availableBalance: 15,
    })

    expect(line.material.materialId).toBe(fixtureUuid(60))
    expect(line.material.materialKind).toBe('Durable')
    expect(line.quantity).toBe(3)
    expect(line.baseQuantity).toBe(3)
    expect(line.conversionFactor).toBe('1.000000')
    expect(line.conversionId).toBeNull()
    expect(line.unit).toMatchObject({ id: fixtureUuid(23), code: 'EA' })
    expect(line.availableBalance).toBe(15)
    expect(line.assetInputs).toBeUndefined()

    const assetLine = createWarehouseDocumentLine({
      lineType: 'Asset',
      assetInputs: [{ assetNumber: 'AST-2024-0001', serialNumber: 'SN-1' }],
    })
    expect(assetLine.lineType).toBe('Asset')
    expect(assetLine.assetInputs).toEqual([{ assetNumber: 'AST-2024-0001', serialNumber: 'SN-1' }])
  })

  it('creates lifecycle events with toStatus/fromStatus per transition type', () => {
    const created = createLifecycleEvent()
    expect(created).toMatchObject({ eventType: 'Created', toStatus: 'Draft' })
    expect(created.fromStatus).toBeUndefined()

    const posted = createLifecycleEvent({
      eventType: 'Posted',
      fromStatus: 'Submitted',
      toStatus: 'Posted',
      documentRowVersion: 3,
    })
    expect(posted.fromStatus).toBe('Submitted')
    expect(posted.toStatus).toBe('Posted')
    expect(posted.documentRowVersion).toBe(3)
    expect(posted.occurredBy.displayName).toBe('مستخدم تجريبي')
  })

  it('exposes the six lifecycle transitions with canonical from/to/eventType', () => {
    expect(DOCUMENT_TRANSITIONS).toMatchObject({
      Submit: { from: ['Draft'], to: 'Submitted', eventType: 'Submitted' },
      Post: { from: ['Submitted'], to: 'Posted', eventType: 'Posted' },
      Reject: { from: ['Submitted'], to: 'Rejected', eventType: 'Rejected' },
      Revise: { from: ['Rejected'], to: 'Draft', eventType: 'RevisionStarted' },
      Cancel: {
        from: ['Draft', 'Submitted', 'Rejected'],
        to: 'Cancelled',
        eventType: 'Cancelled',
      },
      Reverse: { from: ['Posted'], to: 'Reversed', eventType: 'Reversed' },
    })
    expect(DOCUMENT_TRANSITIONS['Edit']).toBeUndefined()
    expect(DOCUMENT_TRANSITIONS['UploadAttachment']).toBeUndefined()
    expect(DOCUMENT_TRANSITIONS['DeleteAttachment']).toBeUndefined()
  })

  it('builds a lenient default policy and status-accurate action maps', () => {
    const policy = createDocumentPolicy()
    expect(policy.documentStatus).toBe('Draft')
    expect(policy.policyKind).toBe('Generic')
    const enabled = policy.actions
      .filter((availability) => availability.presentation === 'Enabled')
      .map((availability) => availability.action)
    expect(enabled).toEqual(expect.arrayContaining(['Submit', 'Post', 'Cancel', 'Reverse']))

    const submitted = createDocumentPolicy({ documentStatus: 'Submitted' })
    expect(submitted.documentStatus).toBe('Submitted')
    const submittedEnabled = submitted.actions
      .filter((availability) => availability.presentation === 'Enabled')
      .map((availability) => availability.action)
    expect(submittedEnabled).toEqual(['Reject', 'Cancel'])
    expect(submitted.actions.find((availability) => availability.action === 'Post')).toMatchObject({
      allowed: false,
      presentation: 'Disabled',
      reasonCode: 'document.signed_original_missing',
    })
    expect(submitted.blockers).toContainEqual(
      expect.objectContaining({ code: 'document.signed_original_missing' }),
    )
    expect(
      submitted.actions.find((availability) => availability.action === 'Submit')?.allowed,
    ).toBe(false)
    expect(
      submitted.actions.find((availability) => availability.action === 'Cancel'),
    ).toMatchObject({
      allowed: true,
      confirmationRequired: true,
      reasonRequired: true,
    })

    const rejected = createDocumentPolicy({ documentStatus: 'Rejected' })
    expect(rejected.actions.find((availability) => availability.action === 'Cancel')).toMatchObject(
      {
        allowed: true,
        confirmationRequired: true,
        reasonRequired: true,
      },
    )

    const posted = createDocumentPolicy({ documentStatus: 'Posted' })
    const reverse = posted.actions.find((availability) => availability.action === 'Reverse')
    expect(reverse).toMatchObject({
      allowed: true,
      confirmationRequired: true,
      reasonRequired: true,
    })
    expect(actionsForDocumentStatus('Reversed').every((a) => a.presentation !== 'Enabled')).toBe(
      true,
    )
  })

  it('shapes blockers and advisories with Arabic messages', () => {
    const blocker = createPolicyBlocker()
    expect(blocker.code).toBe('document.signed_original_missing')
    expect(blocker.field).toBe('attachmentType')
    expect(blocker.messageAr).toBeTruthy()
  })

  it('produces a contract-valid draft document with linked policy and one line', () => {
    const document = createWarehouseDocument()

    expect(document.documentStatus).toBe('Draft')
    expect(document.documentType).toBe('Receiving')
    expect(document.paperDocumentNumber).toBe('2024/123')
    expect(document.paperDocumentYear).toBe(2024)
    expect(document.attachments).toHaveLength(0)
    expect(document.lines).toHaveLength(1)
    expect(document.lines[0]).toMatchObject({ lineId: fixtureUuid(201) })
    expect(document.policy).toMatchObject({
      documentId: document.documentId,
      documentStatus: 'Draft',
      rowVersion: document.rowVersion,
    })
    expect(document.receivingInfo).toMatchObject({ supplierRef: 'SUP-001' })
  })

  it('deep-merges nested overrides and clears optional petals deliberately', () => {
    const document = createWarehouseDocument({
      documentId: fixtureUuid(150),
      documentStatus: 'Submitted',
      rowVersion: 2,
      receivingInfo: undefined,
      issueTo: {
        recipientType: 'OrganizationalUnit',
        recipientId: fixtureUuid(81),
        recipientDisplayName: 'مديرية المعلوماتية',
        issueReason: 'تجهيز جديد',
      },
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(161),
          material: { materialId: fixtureUuid(60), nameAr: 'حاسوب مكتبي' },
          quantity: 3,
        }),
      ],
      policy: { blockers: [{ code: 'x', field: null, messageAr: 'رفض' }] },
    })

    expect(document.documentStatus).toBe('Submitted')
    expect(document.receivingInfo).toBeUndefined()
    expect(document.issueTo?.recipientId).toBe(fixtureUuid(81))
    expect(document.lines).toHaveLength(1)
    expect(document.lines[0]?.material.materialId).toBe(fixtureUuid(60))
    expect(document.lines[0]?.quantity).toBe(3)
    expect(document.policy).toMatchObject({
      documentId: fixtureUuid(150),
      documentStatus: 'Submitted',
      rowVersion: 2,
    })
    expect(document.policy.blockers).toEqual([{ code: 'x', field: null, messageAr: 'رفض' }])
  })

  it('builds action results with the bumped rowVersion and matching event', () => {
    const result = createDocumentActionResult('Submit')

    expect(result.document.documentStatus).toBe('Submitted')
    expect(result.document.rowVersion).toBe(2)
    expect(result.document.policy.documentStatus).toBe('Submitted')
    expect(result.lifecycleEvent).toMatchObject({
      eventType: 'Submitted',
      fromStatus: 'Draft',
      toStatus: 'Submitted',
      documentRowVersion: 2,
    })
    expect(
      createDocumentActionResult('Reverse', { document: { documentId: fixtureUuid(5) } }).document
        .documentId,
    ).toBe(fixtureUuid(5))
    expect(() => createDocumentActionResult('Edit')).toThrow(/not a lifecycle transition action/)
  })
})
