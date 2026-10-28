import { errJson, okPageJson } from '@/test/msw/envelope'
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
  createPolicyBlocker,
  createScopeContext,
  createSession,
  createStockMovement,
  createWarehouse,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  fixtureUuid,
  DOCUMENT_TRANSITIONS,
} from '@/test/msw/factories'

/**
 * The live Material wire, copied verbatim from the running API.
 *
 * `GET /api/v1/catalog/materials?page=1&pageSize=2` against the container
 * `eiams-api-ic-be1` (2026-10-27), first row of `data`, with the response's
 * own pagination block beside it. The OpenAPI snapshot
 * (`eiams-backend-v1.openapi.json`, schema
 * `Application.Materials.GetList.MaterialResponse`) declares the SAME sixteen
 * members (fourteen required plus the nullable `nameEn` and `attributes`) and
 * `additionalProperties: false`, so this snippet is the shape the factory is
 * pinned to — not a shape remembered from a contract that moved.
 */
const LIVE_MATERIAL_WIRE = {
  id: 'c42171a4-2f7b-4458-b465-c561066bdc7a',
  familyId: '49a3fd91-99ac-4d8c-854c-525ffb5c249c',
  nameAr: 'مادة أصول E2E',
  nameEn: 'E2E Asset Material',
  code: 'E2E-ASSET-01',
  materialKind: 'Asset',
  trackingType: 'Serial',
  hasExpiry: false,
  requiresAssetNumber: true,
  catalogVersion: 1,
  attributes: null,
  status: 'Active',
  materialDomainId: '814869fb-2f4f-437f-959b-aa0b36caa2cd',
  materialDomainName: 'Test domain 45590',
  baseUnitId: '4fa18d4e-523d-4dc2-befd-d93c0f03f6cc',
  baseUnitSymbol: 'pcs',
} as const

const LIVE_MATERIAL_PAGINATION = {
  page: 1,
  page_size: 2,
  total_items: 8,
  total_pages: 4,
  has_previous_page: false,
  has_next_page: true,
  total_count: 8,
} as const

/**
 * The two members the live wire declares NULLABLE
 * (`"nameEn": {"type":"string","nullable":true}` and the same for
 * `attributes`), so a factory default of `null` is legal for them and one
 * live row's value says nothing about theirs.
 */
const NULLABLE_ON_THE_WIRE: readonly string[] = ['nameEn', 'attributes']

describe('createMaterial matches the live Material wire', () => {
  it('carries exactly the members the live MaterialResponse declares', () => {
    // A member the wire does not have (`materialDomainCode`) or a nested
    // `materialDomain` / `unit` reference would both show up here.
    expect(Object.keys(createMaterial()).sort()).toEqual(Object.keys(LIVE_MATERIAL_WIRE).sort())
  })

  it('gives every member the type the live wire gives it', () => {
    const material = createMaterial()

    // Every member the live row fills must hold the same JS type here.
    for (const [key, liveValue] of Object.entries(LIVE_MATERIAL_WIRE)) {
      if (liveValue === null || NULLABLE_ON_THE_WIRE.includes(key)) continue
      expect(typeof material[key as keyof typeof material], key).toBe(typeof liveValue)
    }
    // The wire serves `attributes: null` for a material that carries none, and
    // `nameEn` is nullable in the same way — but both still accept a value.
    expect(material.attributes).toBeNull()
    expect(material.nameEn).toBeNull()
    expect(createMaterial({ nameEn: 'E2E Asset Material' }).nameEn).toBe('E2E Asset Material')
    expect(createMaterial({ attributes: '{}' }).attributes).toBe('{}')
  })

  it('mints the live row verbatim when the wire row is handed in', () => {
    expect(createMaterial(LIVE_MATERIAL_WIRE)).toEqual(LIVE_MATERIAL_WIRE)
  })

  it('serves the status as the STRING the wire serves, never the ordinal', () => {
    // The ordinal belongs to `PUT /catalog/materials/{id}/status`, which is a
    // different contract; a read never carries it.
    expect(createMaterial().status).toBe('Active')
    expect(typeof createMaterial().status).toBe('string')
  })

  it('pages the materials list one-based, the way the live envelope does', async () => {
    const body = (await okPageJson([createMaterial(), createMaterial({ id: fixtureUuid(25) })], {
      pageSize: 2,
      totalCount: 8,
      totalPages: 4,
    }).json()) as Record<string, unknown>

    // The wire page is ONE-based: the first page is `1`, and `has_next_page`
    // follows the server's own `page < total_pages` rule.
    expect(body['pagination']).toEqual(LIVE_MATERIAL_PAGINATION)
  })
})

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
      permissionCodes: ['audit.view'],
    })
    const response = createAuthTokenResponse({ expiresInSeconds: 60, session })

    expect(response).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 60 })
    expect(response.session.activeScope).toEqual(scope)
    expect(response.session.permissionCodes).toEqual(['audit.view'])
  })

  it('uses the shared wire paging envelope and derives pagination from items', async () => {
    const body = (await okPageJson([createWarehouse(), createWarehouse({ id: fixtureUuid(32) })], {
      pageSize: 20,
    }).json()) as Record<string, unknown>

    expect(body['success']).toBe(true)
    expect(body['data'] as unknown[]).toHaveLength(2)
    expect(body['pagination']).toMatchObject({
      page: 1,
      page_size: 20,
      total_items: 2,
      total_pages: 1,
      has_previous_page: false,
      has_next_page: false,
      total_count: 2,
    })
    expect(body['meta']).toMatchObject({ request_id: 'test-request-id' })
  })

  it('returns contract-shaped operational entities and problem details', async () => {
    const material = createMaterial({ materialKind: 'Asset', requiresAssetNumber: true })
    const balance = createInventoryBalance({
      materialId: material.id,
      materialNameAr: material.nameAr,
    })
    const movement = createStockMovement({
      materialId: balance.materialId,
      materialNameAr: balance.materialNameAr,
    })

    expect(balance.materialId).toBe(material.id)
    expect(balance.lowStock).toEqual({ state: 1, thresholdQuantity: 5 })
    expect(movement).toMatchObject({
      documentReferenceNumber: 'EIAMS-RCV-2026-0001',
      materialId: balance.materialId,
      movementType: 'Receipt',
      quantityDelta: 5,
    })
    expect(material.requiresAssetNumber).toBe(true)
    const errorBody = await errJson(409, { code: 'conflict.version' }).json()
    expect(errorBody['success']).toBe(false)
    expect((errorBody['error'] as Record<string, unknown>)['code']).toBe('CONFLICT_VERSION')
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
    // The override names the REAL catalog DTO: `id`, not `materialId` — only the
    // generated embedding the document engine still serves calls it `materialId`.
    const line = createWarehouseDocumentLine({
      material: createMaterial({ id: fixtureUuid(60), nameAr: 'حاسوب مكتبي' }),
      quantity: 3,
      availableBalance: 15,
    })

    expect(line.material.materialId).toBe(fixtureUuid(60))
    // `Consumable`, not `Durable`. `'Durable'` only ever existed in the FROZEN
    // GENERATED snapshot's `MaterialKind` union; the live handwritten catalog
    // contract (`catalog.api-types.Material.materialKind`) is
    // `'Consumable' | 'Asset'`, so a line whose material is `Durable` describes a
    // record the API can never send — and `createMaterial()` correctly defaults to
    // `Consumable`. The expectation was the stale side, so it moves to the factory.
    expect(line.material.materialKind).toBe('Consumable')
    expect(line.quantity).toBe(3)
    expect(line.baseQuantity).toBe(3)
    expect(line.conversionFactor).toBe('1.000000')
    expect(line.conversionId).toBeNull()
    // `baseUnitId`/`baseUnitSymbol`, not the nested `baseUnit` reference with a
    // `code`: `UnitOfMeasure` on the wire is `{ id, name, symbol, unitType,
    // status }` and carries no code, so the snapshot names the unit by symbol.
    expect(line.unit).toMatchObject({ id: fixtureUuid(23), displayName: 'حبة' })
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
          material: createMaterial({ id: fixtureUuid(60), nameAr: 'حاسوب مكتبي' }),
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
