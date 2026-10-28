/**
 * The shared document engine's IN-MEMORY model — the types the MSW harness
 * keeps a document in while it replays the lifecycle.
 *
 * ## Why these exist
 *
 * `src/test/msw/warehouse-document-handlers.ts` holds ONE model of a document
 * and projects it into the live wire contract on every response (the `toWire*`
 * functions). That boundary is deliberate: the transition engine, the
 * idempotency memo and every fixture read the model's nested members, while the
 * application only ever sees the flat wire read.
 *
 * The model used to be typed by the generated OpenAPI artifact, which made a
 * frozen, stale
 * document a build dependency of the whole test tree. These declarations
 * replace it. They are the HARNESS's model — NOT a wire contract, and NOT a
 * description of what the API serves. The wire contract is
 * `@/shared/documents/types/document-wire.types.ts`, and every response the
 * harness sends is projected into it.
 *
 * ## What is deliberately NOT here
 *
 * - `DocumentStatus`, `DocumentType` and `DocumentActionType` are imported from
 *   the handwritten homes (`document-wire.types.ts`, `document-action.types.ts`).
 *   Their vocabularies are identical to the ones the deleted artifact carried,
 *   so re-declaring them would only create a second, competing spelling.
 * - `FieldError` is the frontend's own field-error shape, imported from
 *   `@/shared/services/api-error` (the module that produces it).
 *
 * ## Field naming
 *
 * The member names below are the model's own, and they are what the fixtures,
 * the engine and the assertions read. They are deliberately NOT the wire's
 * names (`id` vs `documentId`, `createdAtUtc` vs `createdAt`): the projection
 * is what bridges the two, and collapsing them would put two spellings of one
 * record into the same object.
 */

import type { FieldError } from '@/shared/services/api-error'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type { DocumentStatus, DocumentType } from '@/shared/documents/types/document-wire.types'
import type { CounterpartType } from '@/modules/organization/types/counterpart-lookup.types'

/** A label + identity pair the model uses where the wire carries flat columns. */
export interface NamedReference {
  readonly id: string
  readonly displayName: string
  readonly code?: string | null
  readonly status?: 'Active' | 'Inactive'
}

/**
 * The material a document line embeds.
 *
 * The model's line keeps the material INLINE (the wire line denormalises it
 * into `materialId` / `materialCode` / `materialNameAr`), and keeps the
 * catalog record's own flat columns next to the nested references so a
 * consumer never has to join the catalog to read a material.
 */
export interface DocumentLineMaterial {
  readonly materialId: string
  readonly code: string
  readonly nameAr: string
  readonly nameEn: string | null
  readonly materialKind: 'Consumable' | 'Durable' | 'Asset'
  readonly trackingType: 'Quantity' | 'Serial'
  readonly requiresAssetNumber: boolean
  readonly hasExpiry: boolean
  readonly attributes: string | null
  readonly catalogVersion: number
  readonly rowVersion: number
  readonly status: 'Active' | 'Inactive'
  readonly baseUnitId: string
  readonly baseUnitSymbol: string
  readonly familyId: string
  readonly materialDomainId: string
  readonly materialDomainName: string
  readonly baseUnit: NamedReference
  readonly category: NamedReference
  readonly domain: NamedReference
  readonly family: NamedReference
  readonly descriptionAr: string | null
}

/** One unit captured on an asset line before the document is posted. */
export interface DocumentLineAssetInput {
  readonly assetNumber?: string | null
  readonly serialNumber?: string | null
  readonly acquisitionDate?: string | null
  readonly warrantyExpiry?: string | null
}

export interface DocumentLine {
  readonly lineId: string
  readonly lineType: 'Normal' | 'Asset'
  readonly material: DocumentLineMaterial
  readonly unit?: NamedReference | undefined
  readonly quantity: number
  readonly baseQuantity: number
  readonly unitPrice?: number | null
  readonly availableBalance?: number | null
  readonly batchNumber?: string | null
  readonly expiryDate?: string | null
  readonly openingType?: 'Initial' | 'Correction' | undefined
  readonly conversionFactor: string
  readonly conversionId: string | null
  readonly assetInputs?: readonly DocumentLineAssetInput[] | undefined
  readonly issuedAssetIds?: readonly string[] | undefined
}

export interface DocumentAttachment {
  readonly attachmentId: string
  readonly documentId: string
  readonly attachmentType: 'SignedOriginal' | 'Supporting'
  readonly originalFilename: string
  readonly mimeType: string
  readonly fileSize: number
  readonly checksum: string
  readonly uploadedAt: string
  readonly uploadedBy: NamedReference
  readonly downloadUrl?: string | null
}

/** How available one action is, as the model's policy evaluates it. */
export interface ActionAvailability {
  readonly action: DocumentActionType
  readonly allowed: boolean
  readonly confirmationRequired: boolean
  readonly reasonRequired: boolean
  readonly presentation: 'Hidden' | 'Disabled' | 'Enabled'
  readonly reasonAr?: string | null
  readonly reasonCode?: string | null
}

export interface OperationalAdvisory {
  readonly code: 'ActiveSoftFreeze'
  readonly messageAr: string
  readonly severity: 'Warning'
  readonly countId?: string
  readonly countReference?: string | null
  readonly warehouseId?: string
  readonly overlapState?: 'Provisional' | 'Confirmed'
  readonly scopeSummaryAr?: string | null
}

export interface PolicyBlocker {
  readonly code: string
  readonly messageAr: string
  readonly field?: string | null
}

export interface DocumentPolicy {
  readonly documentId: string
  readonly documentStatus: DocumentStatus
  readonly evaluatedAt: string
  readonly policyKind: 'Generic' | 'Adjustment' | 'Disposal'
  readonly rowVersion: number
  readonly signedOriginalSatisfied: boolean
  readonly actions: readonly ActionAvailability[]
  readonly blockers: readonly PolicyBlocker[]
  readonly advisories: readonly OperationalAdvisory[]
}

/** The authorized actor as the model records them at the moment of the event. */
export interface LifecycleActorSnapshot {
  readonly userId: string
  readonly displayName: string
  readonly roleNameAr?: string | null
}

/** The transition vocabulary the model's event chain uses. */
export type LifecycleEventType =
  'Created' | 'Submitted' | 'Posted' | 'Rejected' | 'RevisionStarted' | 'Cancelled' | 'Reversed'

export interface LifecycleDocumentReference {
  readonly documentId: string
  readonly documentType: DocumentType
  readonly status: DocumentStatus
  readonly systemReferenceNumber: string
  readonly adjustmentId?: string
}

/** One immutable transition in the model's event chain. */
export interface DocumentLifecycleEvent {
  readonly eventId: string
  readonly documentId: string
  readonly eventType: LifecycleEventType
  readonly fromStatus?: DocumentStatus
  readonly toStatus: DocumentStatus
  readonly occurredAt: string
  readonly occurredBy: LifecycleActorSnapshot
  readonly documentRowVersion: number
  readonly reason?: string | null
  readonly correlationId?: string | null
  readonly relatedDocument?: LifecycleDocumentReference
}

/** The outcome the model produces for one accepted lifecycle action. */
export interface DocumentActionResult {
  readonly document: WarehouseDocument
  readonly lifecycleEvent: DocumentLifecycleEvent
  readonly relatedDocument?: LifecycleDocumentReference
}

export interface ReceivingInfo {
  readonly receivingType: string
  readonly supplierRef: string
  readonly supplierInvoiceRef?: string | null
}

export interface IssueTo {
  readonly recipientType: CounterpartType
  readonly recipientId: string
  readonly recipientDisplayName: string
  readonly issueReason: string
}

export interface TransferInfo {
  readonly destinationWarehouseId: string
  readonly destinationWarehouseName: string
  readonly transferReason: string
}

export interface ReturnInfo {
  readonly originalIssueDocumentId: string
  readonly originalIssueReference?: string
  readonly returnReason: string
  readonly assetIds?: readonly string[]
}

/** The document as the model holds it: one record, its policy, and its lines. */
export interface WarehouseDocument {
  readonly documentId: string
  readonly documentType: DocumentType
  readonly documentStatus: DocumentStatus
  readonly systemReferenceNumber: string
  readonly paperDocumentNumber: string
  readonly paperDocumentYear: number
  readonly createdAt: string
  readonly createdBy: NamedReference
  readonly postedAt?: string | null
  readonly postedBy?: NamedReference
  readonly rowVersion: number
  readonly warehouse: NamedReference
  readonly site: NamedReference
  readonly policy: DocumentPolicy
  readonly lines: readonly DocumentLine[]
  readonly attachments: readonly DocumentAttachment[]
  readonly receivingInfo?: ReceivingInfo
  readonly issueTo?: IssueTo
  readonly transferInfo?: TransferInfo
  readonly returnInfo?: ReturnInfo
}

/**
 * The flat problem the model answers a failed action with.
 *
 * Declared as a type alias, not an interface, on purpose: an interface has no
 * implicit index signature, and the harness's error writer takes a problem that
 * may carry arbitrary extra members.
 */
export type ProblemDetails = {
  readonly code: string
  readonly titleAr: string
  readonly detailAr?: string | null
  readonly status: number
  readonly traceId: string
  readonly type?: string | null
  readonly fieldErrors?: readonly FieldError[]
}

/** A problem that also carries the state the client must re-read. */
export type LifecycleConflictProblemDetails = ProblemDetails & {
  readonly currentRowVersion: number
  readonly currentStatus: DocumentStatus
  readonly policy: DocumentPolicy
}

/** The UI page shape the factories still mint for list-shaped fixtures. */
export interface PageMeta {
  readonly pageIndex: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
}
