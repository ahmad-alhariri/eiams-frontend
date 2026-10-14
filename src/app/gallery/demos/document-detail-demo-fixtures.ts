import type {
  DocumentActionAvailability,
  DocumentAttachmentResponse,
  DocumentLineResponse,
  DocumentPolicy,
  DocumentPolicyBlocker,
  DocumentStatus,
  WarehouseDocumentDetails,
} from '@/shared/documents/types/document-wire.types'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
// `Material` is typed against the handwritten catalog contract, not the frozen
// snapshot: the wire serves a flat `id`, `baseUnitId`/`baseUnitSymbol` and
// `materialDomainId`/`materialDomainName`.
import type { Material } from '@/modules/catalog/types/catalog.api-types'

/**
 * Fixture builders for the document-detail gallery demo, and nothing else.
 *
 * Why the gallery builds its own
 * ------------------------------
 * This used to import `createWarehouseDocument` & friends from
 * `@/test/msw/factories`. `src/test/**` is TEST SUPPORT — inline MSW handlers,
 * factories, the lifecycle engine — and a file under `src/app/` importing it is
 * the inverted dependency EPIC G7 exists to close: it points production-shaped
 * code at a tree that only runs under Vitest, and
 * `src/test/no-runtime-test-imports.test.ts` fails the build over it.
 * `factories.ts` said as much in its own header: it exists "for MSW TESTS".
 *
 * The fixture layer itself now lives outside the test tree
 * (`@/shared/fixtures/factories`), so a shared import would technically satisfy
 * the letter of that rule. It is still the wrong dependency here: the component
 * gallery is a dev-only showcase of read-only rendering, it must render when
 * there is no backend and no mock API, and bead `eiams-frontend-vi65.14.6`
 * deletes the mock layer wholesale.
 *
 * Every builder below emits the REAL wire projection — the flat
 * `WarehouseDocumentDetails` / `WarehouseDocumentSummary` shapes the live API
 * serves, not the provisional snapshot's nested `WarehouseDocument`. Reason
 * codes are the live backend's own (`STATE_OR_PERMISSION_NOT_ALLOWED`,
 * `PERMISSION_DENIED`, `WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED`), because the
 * action bar resolves its Arabic tooltip BY CODE through the governed
 * `error-copy-ar.ts` table; a demo-only code would render no tooltip at all.
 */

/** Recursive override type: see `@/shared/fixtures/factories` for the contract. */
type FixtureOverrides<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | undefined
    : T[K] extends object
      ? T[K] | FixtureOverrides<T[K]> | undefined
      : T[K] | undefined
}

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z'

/** Returns a deterministic, syntactically valid UUID for readable demo data. */
export function fixtureUuid(sequence = 1): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`
}

function withOverrides<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  return { ...defaults, ...overrides }
}

/**
 * Recursive merge for the builders that spawn nested entities (document policy,
 * lines, ...): arrays replace wholesale and an explicit `undefined` clears an
 * optional field, mirroring spread semantics.
 */
function mergeDeep<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (defaults as Record<string, unknown>)[key]
    if (isMergeableObject(baseValue) && isMergeableObject(value)) {
      merged[key] = mergeDeep(baseValue as unknown as T, value as unknown as Partial<T>)
    } else {
      merged[key] = value
    }
  }
  return merged as T
}

function isMergeableObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function createMaterial(overrides: FixtureOverrides<Material> = {}): Material {
  return withOverrides(
    {
      id: fixtureUuid(24),
      familyId: fixtureUuid(22),
      nameAr: 'حاسوب مكتبي',
      nameEn: null,
      code: 'IT-HW-PC-001',
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      requiresAssetNumber: false,
      catalogVersion: 1,
      attributes: null,
      status: 'Active',
      materialDomainId: fixtureUuid(20),
      materialDomainName: 'أجهزة الحاسوب',
      baseUnitId: fixtureUuid(23),
      baseUnitSymbol: 'حبة',
    },
    overrides,
  )
}

export { createMaterial }

/**
 * Line overrides whose `materialId` is derived from the REAL catalog DTO, so the
 * demo keeps naming materials the way it always did even though the line
 * projection identifies them by id alone.
 */
type WarehouseDocumentLineOverrides = Omit<FixtureOverrides<DocumentLineResponse>, 'materialId'> & {
  readonly material?: Material
}

export function createWarehouseDocumentLine(
  overrides: WarehouseDocumentLineOverrides = {},
): DocumentLineResponse {
  const { material: materialOverride, ...rest } = overrides
  const material = materialOverride ?? createMaterial()
  const defaults: DocumentLineResponse = {
    id: fixtureUuid(201),
    sourceLineId: null,
    materialId: material.id,
    // The line projection denormalises the identity and label it renders, so the
    // detail table names a material without a second catalog read.
    materialCode: material.code,
    materialNameAr: material.nameAr,
    unitSymbol: material.baseUnitSymbol,
    lineType: 'Normal',
    quantity: 5,
    unitId: material.baseUnitId,
    baseQuantity: 5,
    unitPrice: null,
    batchNumber: null,
    expiryDate: null,
    openingType: null,
    assets: [],
    selectedAssets: [],
    adjustment: null,
  }
  return mergeDeep(defaults, rest)
}

function createActionAvailability(
  actionType: DocumentActionType,
  overrides: FixtureOverrides<DocumentActionAvailability> = {},
): DocumentActionAvailability {
  return withOverrides(
    {
      action: actionType,
      allowed: true,
      confirmationRequired: false,
      presentation: 'Enabled' as const,
      reasonCode: null,
      reason: null,
      reasonRequired: false,
    },
    overrides,
  )
}

/** Lengthy default policy: every action is available so a bare call never blocks. */
const LENIENT_ACTIONS: readonly DocumentActionAvailability[] = [
  createActionAvailability('Edit'),
  createActionAvailability('Submit'),
  createActionAvailability('Post'),
  createActionAvailability('Reject'),
  createActionAvailability('Revise'),
  createActionAvailability('Cancel'),
  createActionAvailability('Reverse'),
  createActionAvailability('UploadAttachment'),
  createActionAvailability('DeleteAttachment'),
]

/** The live backend's reason code for "the state does not allow this". */
const REASON_STATE = 'STATE_OR_PERMISSION_NOT_ALLOWED'

/** Status-aware action availability: only transitions the lifecycle actually permits. */
function actionsForDocumentStatus(status: DocumentStatus): DocumentActionAvailability[] {
  switch (status) {
    case 'Draft':
      return [
        createActionAvailability('Edit'),
        createActionAvailability('Submit'),
        createActionAvailability('Cancel', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('UploadAttachment'),
        createActionAvailability('DeleteAttachment'),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Submitted':
      return [
        createActionAvailability('Post'),
        createActionAvailability('Reject', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Cancel', {
          confirmationRequired: true,
          reasonRequired: true,
        }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Posted':
      return [
        createActionAvailability('Reverse', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Reversed':
      return [
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Cancelled':
      return [
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Rejected':
      return [
        createActionAvailability('Revise'),
        createActionAvailability('Cancel', {
          confirmationRequired: true,
          reasonRequired: true,
        }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('Reject', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: REASON_STATE,
        }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
  }
}

/** D-ATT-01 refinement of the status map for the server-owned signed-original gate. */
function actionsForDocumentPolicy(
  status: DocumentStatus,
  signedOriginalSatisfied: boolean,
): DocumentActionAvailability[] {
  const actions = actionsForDocumentStatus(status)
  if (status !== 'Submitted' || signedOriginalSatisfied) return actions

  return actions.map((availability) =>
    availability.action === 'Post'
      ? createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonCode: 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
        })
      : availability,
  )
}

export function createPolicyBlocker(
  overrides: FixtureOverrides<DocumentPolicyBlocker> = {},
): DocumentPolicyBlocker {
  return withOverrides(
    {
      action: 'Post',
      code: 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
      message: 'The signed copy of the document is required before posting.',
    },
    overrides,
  )
}

export function createDocumentPolicy(
  overrides: FixtureOverrides<DocumentPolicy> = {},
): DocumentPolicy {
  const status = overrides.status ?? 'Draft'
  const signedOriginalSatisfied = overrides.signedOriginalSatisfied ?? false
  const actions =
    overrides.actions ??
    (overrides.status === undefined
      ? LENIENT_ACTIONS
      : actionsForDocumentPolicy(status, signedOriginalSatisfied))
  const blockers =
    overrides.blockers ??
    (status === 'Submitted' && !signedOriginalSatisfied ? [createPolicyBlocker()] : [])
  return withOverrides(
    {
      actions,
      warnings: [],
      blockers,
      documentId: fixtureUuid(200),
      status,
      evaluatedAtUtc: FIXTURE_TIMESTAMP,
      rowVersion: 1,
      signedOriginalSatisfied,
    },
    overrides,
  )
}

export function createDocumentAttachment(
  overrides: FixtureOverrides<DocumentAttachmentResponse> = {},
): DocumentAttachmentResponse {
  return mergeDeep(
    {
      id: fixtureUuid(202),
      attachmentType: 'SignedOriginal',
      fileSize: 2048,
      mimeType: 'application/pdf',
      originalFilename: 'document-original.pdf',
      uploadedAtUtc: FIXTURE_TIMESTAMP,
    },
    overrides,
  )
}

export function createWarehouseDocument(
  overrides: FixtureOverrides<WarehouseDocumentDetails> = {},
): WarehouseDocumentDetails {
  const id = overrides.id ?? fixtureUuid(200)
  const documentStatus = overrides.documentStatus ?? 'Draft'
  const rowVersion = overrides.rowVersion ?? 1
  const defaults: WarehouseDocumentDetails = {
    id,
    warehouseId: fixtureUuid(30),
    // The detail read denormalises the warehouse label and the creating user;
    // the header renders both without joining another resource.
    warehouseCode: 'WH-CENTRAL',
    warehouseName: 'المستودع المركزي',
    documentType: 'Receiving',
    paperDocumentNumber: '2024/123',
    paperDocumentYear: 2024,
    systemReferenceNumber: 'EIAMS-DOC-2024-0001',
    signedCopyAttachmentId: null,
    documentStatus,
    createdAtUtc: FIXTURE_TIMESTAMP,
    createdBy: fixtureUuid(10),
    postedBy: null,
    postedAtUtc: null,
    reversalOfDocumentId: null,
    reversedByDocumentId: null,
    rowVersion,
    receivingInfo: {
      receivingType: 'Purchase',
      supplierInvoiceRef: 'INV-2024-001',
      supplierRef: 'SUP-001',
    },
    issueTo: null,
    transferInfo: null,
    returnInfo: null,
    inventoryAdjustment: null,
    lines: [createWarehouseDocumentLine({ id: fixtureUuid(201) })],
    attachments: [],
    openingAsOfDate: null,
    openingIsZeroStock: false,
  }
  return mergeDeep(defaults, overrides)
}
