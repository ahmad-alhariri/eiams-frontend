/**
 * Handwritten wire contract for the shared warehouse-document spine.
 *
 * ## Why these exist
 *
 * The generated snapshot (`@/shared/types/generated/eiams-v1`) describes a
 * provisional design-first contract that the live API never shipped. Every
 * document write path differs from it:
 *
 * | Concern | Snapshot assumed | Live API serves |
 * | --- | --- | --- |
 * | Action body | `{ rowVersion, reason? }` | `{ expectedRowVersion, reason? }` |
 * | Revise | `POST /{documentId}/revise` | `POST /{documentId}/return-to-draft` |
 * | Reverse | `POST /{documentId}/reverse` | `POST /{documentId}/reversals`, no body, 201 |
 * | Action result | `DocumentActionResult` | `EmptyResponse` |
 * | Post result | `DocumentActionResult` | `PostDocumentResponse` |
 * | Create | full `WarehouseDocument` | `201 { id }` only |
 * | Update draft | `PUT /{documentId}` | no such route |
 * | List filters | `dateFrom` / `dateTo` / `search` | `fromDateUtc` / `toDateUtc` / `systemReferenceNumber` / `paperDocumentNumber` |
 * | Policy | `documentStatus`, `policyKind` | `status`, no policy kind |
 *
 * Every shape below is transcribed from the backend DTO of the same name:
 * `Application.WarehouseDocuments.{GetList,GetById,GetHistory,GetPolicy,Post,CompleteDraft}`
 * and `Web.Api.Infrastructure.{ResourceIdResponse,EmptyResponse}`.
 */

export type Uuid = string

export type DocumentType = 'Receiving' | 'Issue' | 'Transfer' | 'Adjustment' | 'Opening' | 'Return'

export type DocumentStatus =
  'Draft' | 'Submitted' | 'Posted' | 'Reversed' | 'Cancelled' | 'Rejected'

/** `Domain.Common.MovementType` vocabulary reused by document lines. */
export type PartyType = 'Employee' | 'OrganizationalUnit' | 'Site' | 'External'

export type OpeningType = 'Initial' | 'Correction'

/** `Web.Api.Infrastructure.ResourceIdResponse` */
export interface ResourceIdResponse {
  readonly id: Uuid
}

/**
 * `Web.Api.Infrastructure.EmptyResponse`. The backend returns an empty object
 * and carries no post-action state, so callers must re-read the document
 * rather than patch a local copy.
 */
export type EmptyResponse = Record<string, never>

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** `Application.WarehouseDocuments.GetList.WarehouseDocumentResponse` */
export interface WarehouseDocumentSummary {
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly documentType: DocumentType
  readonly paperDocumentNumber: string | null
  readonly paperDocumentYear: number | null
  readonly systemReferenceNumber: string
  readonly documentStatus: DocumentStatus
  readonly postedAtUtc: string | null
  readonly reversalOfDocumentId: Uuid | null
  readonly rowVersion: number
  readonly createdAtUtc: string
  /**
   * Cut-off date the opening inventory represents (D-OPEN-02, PRD §6.4).
   * Only set on Opening documents. Independent of `postedAtUtc`; the
   * former is the business date the physical inventory was measured.
   */
  readonly openingAsOfDate: string | null
  /**
   * True when this Opening document completed the warehouse's
   * initialization with zero positive Opening lines (PRD §6.10). Always
   * false for non-Opening documents.
   */
  readonly openingIsZeroStock: boolean
}

export interface ListWarehouseDocumentsQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly warehouseId?: Uuid
  readonly siteId?: Uuid
  readonly documentType?: DocumentType
  readonly documentStatus?: DocumentStatus
  readonly systemReferenceNumber?: string
  readonly paperDocumentNumber?: string
  readonly fromDateUtc?: string
  readonly toDateUtc?: string
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface DocumentLineSelectedAssetResponse {
  readonly selectionId: Uuid
  readonly assetId: Uuid
  readonly assetNumber: string
  readonly serialNumber: string | null
}

export interface DocumentLineAssetResponse {
  readonly id: Uuid
  readonly warehouseId: Uuid | null
  readonly assetNumber: string
  readonly serialNumber: string | null
  readonly acquisitionDate: string
  readonly warrantyExpiry: string | null
}

export interface AdjustmentLineResponse {
  readonly difference: number
  readonly reason: string
}

export interface DocumentLineResponse {
  readonly id: Uuid
  readonly sourceLineId: Uuid | null
  readonly materialId: Uuid
  readonly materialCode: string
  readonly materialNameAr: string
  readonly unitSymbol: string | null
  readonly lineType: string
  readonly quantity: number
  readonly unitId: Uuid | null
  readonly baseQuantity: number
  readonly unitPrice: number | null
  readonly batchNumber: string | null
  readonly expiryDate: string | null
  readonly openingType: string | null
  readonly assets: readonly DocumentLineAssetResponse[]
  readonly selectedAssets: readonly DocumentLineSelectedAssetResponse[]
  readonly adjustment: AdjustmentLineResponse | null
}

export interface DocumentAttachmentResponse {
  readonly id: Uuid
  readonly attachmentType: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly fileSize: number
  readonly uploadedAtUtc: string
}

export interface ReceivingInfoResponse {
  readonly supplierRef: string
  readonly supplierInvoiceRef: string | null
  readonly receivingType: string
}

export interface IssueToResponse {
  readonly recipientType: string
  readonly recipientId: Uuid
  readonly issueReason: string
  readonly recipientDisplayName: string | null
  readonly recipientStatus: string | null
}

export interface TransferInfoResponse {
  readonly destinationWarehouseId: Uuid
  readonly transferReason: string
}

export interface ReturnInfoResponse {
  readonly originalIssueDocumentId: Uuid
  readonly returnReason: string
  readonly originalRecipientType: string | null
  readonly originalRecipientId: Uuid | null
  readonly originalRecipientDisplayName: string | null
  readonly originalRecipientStatus: string | null
}

export interface InventoryAdjustmentResponse {
  readonly countId: Uuid | null
  readonly adjustmentKind: string
  readonly status: string
  readonly reason: string
}

/**
 * `Application.WarehouseDocuments.GetById.WarehouseDocumentDetailsResponse`.
 *
 * The detail read carries the petals, lines and attachments inline, so one
 * request backs a whole detail page and no separate line fetch is needed for
 * a read.
 */
export interface WarehouseDocumentDetails {
  readonly id: Uuid
  readonly warehouseId: Uuid
  readonly warehouseCode: string
  readonly warehouseName: string
  readonly documentType: DocumentType
  readonly paperDocumentNumber: string | null
  readonly paperDocumentYear: number | null
  readonly systemReferenceNumber: string
  readonly signedCopyAttachmentId: Uuid | null
  readonly documentStatus: DocumentStatus
  readonly createdAtUtc: string
  readonly createdBy: Uuid | null
  readonly postedBy: Uuid | null
  readonly postedAtUtc: string | null
  readonly reversalOfDocumentId: Uuid | null
  readonly reversedByDocumentId: Uuid | null
  readonly rowVersion: number
  readonly receivingInfo: ReceivingInfoResponse | null
  readonly issueTo: IssueToResponse | null
  readonly transferInfo: TransferInfoResponse | null
  readonly returnInfo: ReturnInfoResponse | null
  readonly inventoryAdjustment: InventoryAdjustmentResponse | null
  readonly lines: readonly DocumentLineResponse[]
  readonly attachments: readonly DocumentAttachmentResponse[]
  /**
   * Cut-off date the opening inventory represents (D-OPEN-02, PRD §6.4).
   * Only set on Opening documents. Independent of `postedAtUtc`.
   */
  readonly openingAsOfDate: string | null
  /**
   * True when this Opening document completed the warehouse's
   * initialization with zero positive Opening lines (PRD §6.10). Always
   * false for non-Opening documents.
   */
  readonly openingIsZeroStock: boolean
}

// ---------------------------------------------------------------------------
// History and policy
// ---------------------------------------------------------------------------

/** `Application.WarehouseDocuments.GetHistory.DocumentLifecycleEventResponse` */
export interface DocumentLifecycleEvent {
  readonly eventId: Uuid
  readonly fromStatus: DocumentStatus | null
  readonly toStatus: DocumentStatus
  readonly action: string
  readonly reason: string | null
  readonly actorUserId: Uuid | null
  readonly actorDisplayName: string
  readonly occurredAtUtc: string
  readonly resultingRowVersion: number
  readonly requestId: string | null
  readonly operationId: Uuid
}

/** `Application.WarehouseDocuments.GetHistory.WarehouseDocumentHistoryResponse` */
export interface DocumentLifecycleHistory {
  readonly documentId: Uuid
  readonly currentStatus: DocumentStatus
  readonly currentRowVersion: number
  readonly events: readonly DocumentLifecycleEvent[]
}

export type DocumentActionPresentation = 'Hidden' | 'Disabled' | 'Enabled'

/** `Application.WarehouseDocuments.GetPolicy.DocumentActionAvailabilityResponse` */
export interface DocumentActionAvailability {
  readonly action: string
  readonly allowed: boolean
  readonly confirmationRequired: boolean
  readonly reasonRequired: boolean
  readonly presentation: DocumentActionPresentation
  readonly reasonCode: string | null
  readonly reason: string | null
}

export interface DocumentPolicyBlocker {
  readonly action: string
  readonly code: string
  readonly message: string
}

export interface DocumentPolicyAdvisory {
  readonly code: string
  readonly message: string
  readonly countId: Uuid | null
  readonly warehouseId: Uuid | null
}

/** `Application.WarehouseDocuments.GetPolicy.WarehouseDocumentPolicyResponse` */
export interface DocumentPolicy {
  readonly documentId: Uuid
  readonly status: DocumentStatus
  readonly rowVersion: number
  readonly evaluatedAtUtc: string
  readonly signedOriginalSatisfied: boolean
  readonly actions: readonly DocumentActionAvailability[]
  readonly blockers: readonly DocumentPolicyBlocker[]
  readonly warnings: readonly DocumentPolicyAdvisory[]
}

// ---------------------------------------------------------------------------
// Write models
// ---------------------------------------------------------------------------

export interface CreateDocumentRequest {
  readonly warehouseId: Uuid
  readonly documentType: DocumentType
}

/** Every lifecycle action guards on the version the user was shown. */
export interface VersionedDocumentActionRequest {
  readonly expectedRowVersion: number
}

export interface ReasonedDocumentActionRequest extends VersionedDocumentActionRequest {
  readonly reason?: string | null
}

export interface UpdatePaperReferenceRequest {
  readonly expectedRowVersion: number
  readonly paperDocumentNumber: string
  readonly paperDocumentYear: number
}

/** `Application.WarehouseDocuments.Post.PostDocumentResponse` */
export interface PostDocumentResponse {
  readonly documentId: Uuid
  readonly warnings: readonly DocumentPolicyAdvisory[]
}

/**
 * Per-unit identity captured while an asset line is still a draft.
 *
 * `assetNumber` is optional for BOTH tracking types: leaving it blank is a recorded decision meaning
 * "generate one at post" (the server produces `AST-{assetId}`), while supplying it means the user
 * entered an institutional number that must be unique. `serialNumber` is required when the material
 * is Serial-tracked and must be absent when it is Quantity-tracked.
 */
export interface AssetInput {
  readonly assetNumber?: string | null
  readonly serialNumber?: string | null
}

/** `Application.WarehouseDocuments.CompleteDraft.CompleteWarehouseDocumentDraftLine` */
export interface CompleteDraftLine {
  readonly materialId: Uuid
  readonly quantity?: number | null
  readonly difference?: number | null
  readonly unitId?: Uuid | null
  readonly unitPrice?: number | null
  readonly batchNumber?: string | null
  readonly expiryDate?: string | null
  readonly openingType?: OpeningType | null
  /** Issue/Return: select assets that already exist. */
  readonly assetIds?: readonly Uuid[] | null
  /** Receiving/Opening: capture the identity of units this draft will register at post. */
  readonly assetInputs?: readonly AssetInput[] | null
  readonly adjustmentReason?: string | null
}

export interface ReceivingDraftDetails {
  readonly supplierPartyId: Uuid
  readonly supplierInvoiceRef?: string | null
}

export interface IssueDraftDetails {
  readonly recipientType: PartyType
  readonly recipientId: Uuid
  readonly issueReason: string
}

export interface TransferDraftDetails {
  readonly destinationWarehouseId: Uuid
  readonly transferReason: string
}

export interface ReturnDraftDetails {
  readonly originalIssueDocumentId: Uuid
  readonly returnReason: string
}

export interface AdjustmentDraftDetails {
  readonly countId?: Uuid | null
  readonly adjustmentKind: string
  readonly reason: string
}

/**
 * `Application.WarehouseDocuments.CompleteDraft.CompleteWarehouseDocumentDraftCommand`.
 *
 * This is the only write that creates a document together with its lines, and
 * it is idempotent via the `Idempotency-Key` header. The separate
 * `POST /warehouse-documents` route creates an empty document and answers
 * `{ id }`, so a form that has lines to save must use this route.
 */
export interface CompleteDraftRequest {
  readonly warehouseId: Uuid
  readonly documentType: DocumentType
  readonly lines: readonly CompleteDraftLine[]
  readonly receivingInfo?: ReceivingDraftDetails | null
  readonly issueTo?: IssueDraftDetails | null
  readonly transferInfo?: TransferDraftDetails | null
  readonly returnInfo?: ReturnDraftDetails | null
  readonly adjustmentInfo?: AdjustmentDraftDetails | null
}
