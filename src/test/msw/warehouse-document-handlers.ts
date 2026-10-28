import { delay, http, type HttpHandler } from 'msw'

import { environment } from '@/config/env'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import {
  actionRequiresReason,
  actionsForDocumentPolicy,
  createDocumentPolicy,
  createLifecycleEvent,
  createMaterial,
  createNamedReference,
  createPolicyBlocker,
  createSite,
  createWarehouse,
  createWarehouseDocument,
  toDocumentLineMaterial,
  DOCUMENT_TRANSITIONS,
  fixtureUuid,
} from '@/test/msw/factories'
import { apiJson, okJson, okPageJson, toWireErrorResponse } from '@/test/msw/envelope'
// `Warehouse`/`Site` are typed against the handwritten contracts, NOT the frozen
// generated snapshot: the wire record serves `id` + a FLAT `siteId` and carries
// no nested site snapshot, so the generated `Warehouse` (whose `site` object
// this harness used to read a site label from) describes nothing the backend
// ever returned.
import type { Site } from '@/modules/organization/types/organization.api-types'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'
// The harness's IN-MEMORY document model lives in the test tree, not in the
// deleted generated artifact: the transition engine, the idempotency memo and
// every fixture read these nested members, and every RESPONSE is projected
// into the handwritten wire contract below.
import type {
  DocumentActionResult,
  DocumentAttachment,
  DocumentLifecycleEvent,
  DocumentLine,
  LifecycleActorSnapshot,
  LifecycleConflictProblemDetails,
  LifecycleDocumentReference,
  NamedReference,
  ProblemDetails,
  WarehouseDocument,
} from '@/test/msw/document-engine.types'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'

import type { Material } from '@/modules/catalog/types/catalog.api-types'
import type {
  CompleteDraftLine,
  CompleteDraftRequest,
  DocumentActionPresentation,
  DocumentAttachmentResponse,
  DocumentLineResponse,
  DocumentPolicy as WireDocumentPolicy,
  DocumentLifecycleHistory,
  DocumentLifecycleEvent as WireDocumentLifecycleEvent,
  DocumentStatus,
  DocumentType,
  PostDocumentResponse,
  WarehouseDocumentDetails,
  WarehouseDocumentSummary,
} from '@/shared/documents/types/document-wire.types'

/**
 * Scenario handler builders for the shared document engine.
 *
 * These functions return MSW handler arrays (registered via `server.use(...)`)
 * so document-engine tests — list filtering, detail, history, policy, and the
 * lifecycle action POSTs — exercise the exact shapes the LIVE API serves.
 *
 * ## Why the boundary projects
 *
 * The harness keeps the snapshot's nested `WarehouseDocument` as its IN-MEMORY
 * model, because the transition engine, the idempotency memo and every fixture
 * read its `warehouse`/`createdBy`/`policy` members. Everything that crosses HTTP
 * is projected by the `toWire*` functions below into the handwritten wire
 * contract (`document-wire.types.ts`): the flat `WarehouseDocumentSummary` and
 * `WarehouseDocumentDetails`, the policy with `status`/`warnings`, the history
 * with `action`/`actorDisplayName`, and the action routes that answer
 * `EmptyResponse` / `PostDocumentResponse` / `201 { id }` instead of the
 * snapshot's `DocumentActionResult`.
 *
 * A test that reads a response therefore sees exactly what the application sees,
 * which is the whole point of the harness.
 *
 * What used to live ONLY in the dev mock, and now lives here so deleting
 * `src/mocks/` (EPIC G7, bead `eiams-frontend-79na` → `eiams-frontend-m4jm`)
 * could not lose it:
 * - the `Idempotency-Key` memo wiring — `documentActionIdempotency`,
 *   `readIdempotencyKey`, `applyIdempotentDocumentAction` below;
 * - the browser-first multipart branch — `readRequestForm` in
 *   `@/test/msw/multipart-parser`;
 * - the audit chronology comparator — `@/test/msw/audit-chronology`;
 * - the adjustment policy simulator — `@/test/msw/adjustment-policy-simulator`.
 */

const DOCUMENT_PREFIX = `${environment.apiBaseUrl}/warehouse-documents`

const LIST_DEFAULT_PAGE_SIZE = 20

const DEFAULT_ACTOR: LifecycleActorSnapshot = {
  userId: fixtureUuid(10),
  displayName: 'مستخدم تجريبي',
  roleNameAr: 'أمين المستودع',
}

// POLICY-BLOCKER code (frontend vocabulary, `policy-blocker-codes.ts`) — NOT a wire
// error code. Blockers and error envelopes are separate namespaces.
const SIGNED_ORIGINAL_MISSING_CODE = 'document.signed_original_missing'
// WIRE error code emitted by the backend (`WarehouseDocuments.SignedCopyRequired`).
const SIGNED_COPY_REQUIRED_ERROR_CODE = 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED'
const SIGNED_ORIGINAL_MISSING_DETAIL_AR = 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.'

function signedOriginalMissingProblem(): ProblemDetails {
  return problemBase(
    SIGNED_COPY_REQUIRED_ERROR_CODE,
    SIGNED_ORIGINAL_MISSING_DETAIL_AR,
    422,
    'attachmentType',
  )
}

const DOCUMENT_ACTION_ROUTES: ReadonlyArray<readonly [DocumentActionType, string]> = [
  ['Cancel', 'cancel'],
  ['Post', 'post'],
  ['Reject', 'reject'],
  ['Reverse', 'reversals'],
  ['Revise', 'return-to-draft'],
  ['Submit', 'submit'],
]

// ---------------------------------------------------------------------------
// Wire projection
//
// Everything above this line reasons about the snapshot's nested document; every
// response below it is the handwritten wire contract the live API serves.
// ---------------------------------------------------------------------------

/**
 * Warehouse code for the denormalised detail header.
 *
 * `WarehouseDocument.warehouse` is only a `NamedReference` (id + label), and the
 * snapshot carried no code, so the projection reads the code off the canonical
 * warehouse record that id names and falls back to a stable derived code for an
 * id no warehouse fixture defines. Deriving is better than dropping: the live
 * `WarehouseDocumentDetails` always serves `warehouseCode`.
 */
const CANONICAL_WAREHOUSE: Warehouse = createWarehouse()

function wireWarehouseCode(warehouseId: string): string {
  return warehouseId === CANONICAL_WAREHOUSE.id
    ? CANONICAL_WAREHOUSE.code
    : `WH-${warehouseId.slice(0, 8).toUpperCase()}`
}

export function toWireLine(line: DocumentLine): DocumentLineResponse {
  // The snapshot spelled the issued-asset projection `issuedAssetIds`; the real
  // `DocumentLineResponse` calls the same set `selectedAssets` and carries a
  // selection id per entry.
  const issuedAssetIds = line.issuedAssetIds ?? []
  const selectedAssets = issuedAssetIds.map((assetId, index) => ({
    selectionId: fixtureUuid(400 + index),
    assetId,
    assetNumber: `AST-${assetId.slice(0, 4)}`,
    serialNumber: null,
  }))
  return {
    id: line.lineId,
    sourceLineId: null,
    materialId: line.material.materialId,
    // The wire line denormalises the material identity and label the detail
    // table renders, so a read never joins the catalog. The harness's in-memory
    // line still embeds the generated material snapshot, so the projection is
    // what carries those three fields across.
    materialCode: line.material.code,
    materialNameAr: line.material.nameAr,
    unitSymbol: line.unit?.displayName ?? null,
    lineType: line.lineType,
    quantity: line.quantity,
    unitId: line.unit?.id ?? null,
    baseQuantity: line.baseQuantity,
    unitPrice: line.unitPrice ?? null,
    batchNumber: line.batchNumber ?? null,
    expiryDate: line.expiryDate ?? null,
    openingType: line.openingType ?? null,
    assets: (line.assetInputs ?? []).map((assetInput, index) => ({
      id: fixtureUuid(500 + index),
      warehouseId: null,
      assetNumber: assetInput.assetNumber ?? `AST-${index + 1}`,
      serialNumber: assetInput.serialNumber ?? null,
      acquisitionDate: assetInput.acquisitionDate ?? '2024-01-01',
      warrantyExpiry: assetInput.warrantyExpiry ?? null,
    })),
    selectedAssets,
    adjustment: null,
  }
}

/**
 * One attachment record in the wire spelling.
 *
 * The live `DocumentAttachmentResponse` is a flat `{ id, attachmentType,
 * originalFilename, mimeType, fileSize, uploadedAtUtc }`. The snapshot's record
 * carried the document it belonged to, a checksum, the uploader and an optional
 * download URL; none of that crosses HTTP, so none of it is projected.
 */
export function toWireAttachment(attachment: DocumentAttachment): DocumentAttachmentResponse {
  return {
    id: attachment.attachmentId,
    attachmentType: attachment.attachmentType,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    uploadedAtUtc: attachment.uploadedAt,
  }
}

/**
 * Read an Opening-only field off a `WarehouseDocument` fixture without
 * requiring the generated type to know about D-OPEN-02's wire additions.
 * The factory's generated `WarehouseDocument` predates the Opening
 * detail fields; tests cast the fixture to add them, and this helper
 * narrows the cast at the single place that needs to read them.
 */
function readOpeningField(
  document: WarehouseDocument,
  key: 'openingAsOfDate',
): string | null | undefined
function readOpeningField(
  document: WarehouseDocument,
  key: 'openingIsZeroStock',
): boolean | undefined
function readOpeningField(
  document: WarehouseDocument,
  key: 'openingAsOfDate' | 'openingIsZeroStock',
): string | null | boolean | undefined {
  return (document as unknown as Record<string, unknown>)[key] as
    string | null | boolean | undefined
}

export function toWireDetails(document: WarehouseDocument): WarehouseDocumentDetails {
  return {
    id: document.documentId,
    warehouseId: document.warehouse.id,
    // The detail read names its warehouse inline (code + label) and stamps the
    // creating user and instant. The harness keeps only a `NamedReference` for
    // the warehouse, so the label travels on that reference and the code comes
    // from the canonical warehouse record the reference points at.
    warehouseCode: wireWarehouseCode(document.warehouse.id),
    warehouseName: document.warehouse.displayName,
    documentType: document.documentType,
    paperDocumentNumber: document.paperDocumentNumber,
    paperDocumentYear: document.paperDocumentYear,
    systemReferenceNumber: document.systemReferenceNumber,
    signedCopyAttachmentId: document.policy.signedOriginalSatisfied
      ? (document.attachments[0]?.attachmentId ?? null)
      : null,
    documentStatus: document.documentStatus,
    createdAtUtc: document.createdAt,
    createdBy: document.createdBy.id,
    postedBy: document.postedBy?.id ?? null,
    postedAtUtc: document.postedAt ?? null,
    reversalOfDocumentId: null,
    reversedByDocumentId: null,
    rowVersion: document.rowVersion,
    receivingInfo:
      document.receivingInfo === undefined
        ? null
        : {
            supplierRef: document.receivingInfo.supplierRef,
            supplierInvoiceRef: document.receivingInfo.supplierInvoiceRef ?? null,
            receivingType: document.receivingInfo.receivingType,
          },
    issueTo:
      document.issueTo === undefined
        ? null
        : {
            recipientType: document.issueTo.recipientType,
            recipientId: document.issueTo.recipientId,
            issueReason: document.issueTo.issueReason,
            recipientDisplayName: document.issueTo.recipientDisplayName ?? null,
            recipientStatus: null,
          },
    transferInfo:
      document.transferInfo === undefined
        ? null
        : {
            destinationWarehouseId: document.transferInfo.destinationWarehouseId,
            transferReason: document.transferInfo.transferReason,
          },
    returnInfo:
      document.returnInfo === undefined
        ? null
        : {
            originalIssueDocumentId: document.returnInfo.originalIssueDocumentId,
            returnReason: document.returnInfo.returnReason,
            originalRecipientType: null,
            originalRecipientId: null,
            originalRecipientDisplayName: null,
            originalRecipientStatus: null,
          },
    inventoryAdjustment: null,
    lines: document.lines.map(toWireLine),
    attachments: document.attachments.map(toWireAttachment),
    // D-OPEN-02 (PRD §6.4 + §6.10): the Opening cut-off date and the
    // zero-stock initialization flag travel on the detail wire (the
    // backend fills them in production; the test harness reads them
    // off the same `WarehouseDocument` fixture the factory builds so
    // detail-page tests can assert the cut-off date independently of
    // the posting timestamp).
    openingAsOfDate: readOpeningField(document, 'openingAsOfDate') ?? null,
    openingIsZeroStock: readOpeningField(document, 'openingIsZeroStock') ?? false,
  }
}

export function toWireSummary(document: WarehouseDocument): WarehouseDocumentSummary {
  return {
    id: document.documentId,
    warehouseId: document.warehouse.id,
    documentType: document.documentType,
    paperDocumentNumber: document.paperDocumentNumber,
    paperDocumentYear: document.paperDocumentYear,
    systemReferenceNumber: document.systemReferenceNumber,
    documentStatus: document.documentStatus,
    postedAtUtc: document.postedAt ?? null,
    reversalOfDocumentId: null,
    rowVersion: document.rowVersion,
    createdAtUtc: document.createdAt,
    // Read from the model the way `toWireDetails` does. These used to be
    // hard-coded to `null` / `false`, which meant every Opening list row came
    // back looking uninitialized: the cut-off-date column had nothing to render
    // and the zero-stock chip could never appear, so a defect in either was
    // unreproducible rather than absent.
    openingAsOfDate: readOpeningField(document, 'openingAsOfDate') ?? null,
    openingIsZeroStock: readOpeningField(document, 'openingIsZeroStock') ?? false,
  }
}

/**
 * Action reason codes: the harness vocabulary → the codes the live API serves.
 *
 * The in-memory policy evaluates a reason per action in the frontend's own
 * `document.<state>` spelling, but the wire contract carries the backend's error
 * codes, and the UI resolves every user-facing sentence from that code through
 * the governed `error-copy-ar.ts` table. A harness that projected its own codes
 * would answer with codes the copy table has never heard of, and every disabled
 * action would render with no Arabic reason — a failure the tests could not
 * distinguish from a real defect. Translating here keeps the in-memory
 * evaluation readable and the response honest.
 *
 * Blocker codes are NOT translated: `policy-blocker-codes.ts` names the
 * `signed_original_*` / `document.signed_original_*` vocabulary as the contract's
 * own machine gate reasons, and both the preflight gate and the attachment gate
 * row match on it.
 */
const WIRE_REASON_CODES: Readonly<Record<string, string>> = {
  'document.not_posted': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.not_submitted': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.submitted': 'WAREHOUSE_DOCUMENTS_NOT_EDITABLE',
  'document.posted': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.rejected': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.reversed': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.cancelled': 'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
  'document.signed_original_missing': 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
}

function toWireReasonCode(code: string | null): string | null {
  if (code === null) {
    return null
  }
  return WIRE_REASON_CODES[code] ?? code
}

export function toWirePolicy(document: WarehouseDocument): WireDocumentPolicy {
  const policy = document.policy
  return {
    documentId: document.documentId,
    status: document.documentStatus,
    rowVersion: document.rowVersion,
    evaluatedAtUtc: policy.evaluatedAt,
    signedOriginalSatisfied: policy.signedOriginalSatisfied,
    actions: policy.actions.map((availability) => ({
      action: availability.action,
      allowed: availability.allowed,
      confirmationRequired: availability.confirmationRequired,
      reasonRequired: availability.reasonRequired,
      presentation: availability.presentation as DocumentActionPresentation,
      reasonCode: toWireReasonCode(availability.reasonCode ?? null),
      // The live projection carries English prose here. The UI never renders it;
      // `document-policy-gates.ts` resolves the sentence by code.
      reason: availability.reasonAr ?? null,
    })),
    blockers: policy.blockers.map((blocker) => ({
      action: 'Post',
      code: blocker.code,
      message: blocker.messageAr,
    })),
    warnings: policy.advisories.map((advisory) => ({
      code: advisory.code,
      message: advisory.messageAr,
      countId: advisory.countId ?? null,
      warehouseId: advisory.warehouseId ?? null,
    })),
  }
}

export function toWireLifecycleEvent(event: DocumentLifecycleEvent): WireDocumentLifecycleEvent {
  return {
    eventId: event.eventId,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus,
    action: event.eventType,
    reason: event.reason ?? null,
    actorUserId: event.occurredBy.userId,
    actorDisplayName: event.occurredBy.displayName,
    occurredAtUtc: event.occurredAt,
    resultingRowVersion: event.documentRowVersion,
    requestId: event.correlationId ?? null,
    operationId: fixtureUuid(900),
  }
}

export function toWireHistory(
  documentId: string,
  events: readonly DocumentLifecycleEvent[],
  currentStatus: DocumentStatus,
  currentRowVersion: number,
): DocumentLifecycleHistory {
  return {
    documentId,
    currentStatus,
    currentRowVersion,
    events: events.map(toWireLifecycleEvent),
  }
}

/** `PostDocumentResponse` — the one lifecycle route that answers anything. */
export function toWirePostResult(document: WarehouseDocument): PostDocumentResponse {
  return { documentId: document.documentId, warnings: [] }
}

export const WAREHOUSE_DOCUMENT_STATUSES = [
  'Draft',
  'Submitted',
  'Posted',
  'Reversed',
  'Cancelled',
  'Rejected',
] as const

export const WAREHOUSE_DOCUMENT_TYPES = [
  'Receiving',
  'Issue',
  'Transfer',
  'Adjustment',
  'Opening',
  'Return',
] as const

interface DocumentListQuery {
  documentStatus?: DocumentStatus
  documentType?: DocumentType
  /** One-based page index, as bound by `PaginationQueryParameters.Page`. */
  page: number
  pageSize: number
  systemReferenceNumber?: string
  paperDocumentNumber?: string
  warehouseId?: string
}

function isPresent(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value.trim().length > 0
}

function queryEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/**
 * Reads the list query the way the backend actually binds it.
 *
 * The page parameter is `page` and is ONE-BASED (`PaginationQueryParameters.Page`,
 * `Range(1, ...)`, default 1). This harness used to read a zero-based
 * `pageIndex`, a convention no backend accepts, so it silently disagreed with
 * every list request the application makes. `pageSize` is read under the name
 * `toWirePaginationParams` actually emits; whether the backend binds that as
 * `pageSize` or `page_size` is `eiams-frontend-3svn`'s decision, and this
 * harness deliberately does not pre-empt it.
 *
 * Out-of-range values clamp the way ASP.NET model binding would: a `page` below
 * 1 becomes 1 and a non-positive page size falls back to the default, instead of
 * producing a negative slice offset.
 */
function parseDocumentListQuery(url: URL): DocumentListQuery {
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10)
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? String(LIST_DEFAULT_PAGE_SIZE),
    10,
  )
  const query: DocumentListQuery = {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : LIST_DEFAULT_PAGE_SIZE,
  }
  const systemReferenceNumber = url.searchParams.get('systemReferenceNumber')
  if (systemReferenceNumber !== null) {
    query.systemReferenceNumber = systemReferenceNumber
  }
  const paperDocumentNumber = url.searchParams.get('paperDocumentNumber')
  if (paperDocumentNumber !== null) {
    query.paperDocumentNumber = paperDocumentNumber
  }
  const warehouseId = url.searchParams.get('warehouseId')
  if (warehouseId !== null) {
    query.warehouseId = warehouseId
  }
  const documentStatus = queryEnum(
    url.searchParams.get('documentStatus'),
    WAREHOUSE_DOCUMENT_STATUSES,
  )
  if (documentStatus !== undefined) {
    query.documentStatus = documentStatus
  }
  const documentType = queryEnum(url.searchParams.get('documentType'), WAREHOUSE_DOCUMENT_TYPES)
  if (documentType !== undefined) {
    query.documentType = documentType
  }
  return query
}

function contains(haystack: string, needle: string | undefined): boolean {
  return needle === undefined || haystack.toLowerCase().includes(needle.toLowerCase())
}

/**
 * Wire page count for a filtered list.
 *
 * Replaces the former `pageMeta()`, which built the UI shape
 * `{pageIndex, pageSize, totalItems, totalPages}` and existed only to be
 * embedded in a bare `{items, meta}` body the backend never sends.
 * `okPageJson` derives the snake_case `pagination` block the contract carries.
 */
function totalPageCount(totalItems: number, pageSize: number): number {
  return totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
}

function notFound() {
  return toWireErrorResponse({ code: 'WAREHOUSE_DOCUMENTS_NOT_FOUND', status: 404 }, 404)
}

function problemBase(
  code: string,
  detailAr: string,
  status: number,
  field?: string,
): ProblemDetails {
  return {
    code,
    detailAr,
    fieldErrors: field === undefined ? [] : [{ code, field, messageAr: detailAr }],
    status,
    titleAr: 'تعذر إتمام الطلب',
    traceId: 'mock-trace',
    type: `https://eiams.example/problems/${code}`,
  }
}

export function versionConflictProblem(
  document: WarehouseDocument,
): LifecycleConflictProblemDetails {
  return {
    ...problemBase(
      'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
      'تعذر تنفيذ الإجراء: المستند عدَّله مستخدم آخر. أعد تحميل البيانات وحاول مجدداً.',
      409,
    ),
    currentRowVersion: document.rowVersion,
    currentStatus: document.documentStatus,
    policy: document.policy,
  }
}

function actionNotAllowedProblem(
  document: WarehouseDocument,
  action: DocumentActionType,
): LifecycleConflictProblemDetails {
  return {
    ...problemBase(
      'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
      `لا يمكن تنفيذ إجراء «${action}» في الحالة «${document.documentStatus}» الحالية للمستند.`,
      409,
    ),
    currentRowVersion: document.rowVersion,
    currentStatus: document.documentStatus,
    policy: document.policy,
  }
}

export interface IdempotencyMemoInput {
  idempotencyKey: string | null
  action: DocumentActionType
  documentId: string
  rowVersion: number
  reason: string | null
}

export type IdempotencyMemoCheck =
  { kind: 'replay'; result: DocumentActionResult } | { kind: 'mismatch' } | { kind: 'miss' }

export interface IdempotencyMemo {
  check: (input: IdempotencyMemoInput) => IdempotencyMemoCheck
  store: (
    idempotencyKey: string,
    action: DocumentActionType,
    documentId: string,
    rowVersion: number,
    reason: string | null,
    result: DocumentActionResult,
  ) => void
}

type IdempotencyMemoEntry = {
  rowVersion: number
  reason: string | null
  result: DocumentActionResult
}

function idempotencyMemoKey(
  documentId: string,
  action: DocumentActionType,
  idempotencyKey: string,
): string {
  return `${documentId}|${action}|${idempotencyKey}`
}

/**
 * Idempotency memo for lifecycle action routes (D-LIFE-01 §94-97). Only
 * successful (`ok`) outcomes are stored; a replay with the same key and an
 * equivalent request (rowVersion AND reason) returns the ORIGINAL result
 * object without re-applying the transition. Conflicts and validations are
 * never stored, so a same-key retry after a 409/422 proceeds fresh.
 */
export function createIdempotencyMemo(): IdempotencyMemo {
  const attempts = new Map<string, IdempotencyMemoEntry>()
  return {
    check: ({ idempotencyKey, action, documentId, rowVersion, reason }) => {
      if (idempotencyKey === null) {
        return { kind: 'miss' }
      }
      const entry = attempts.get(idempotencyMemoKey(documentId, action, idempotencyKey))
      if (entry === undefined) {
        return { kind: 'miss' }
      }
      if (entry.rowVersion !== rowVersion || entry.reason !== reason) {
        return { kind: 'mismatch' }
      }
      return { kind: 'replay', result: entry.result }
    },
    store: (idempotencyKey, action, documentId, rowVersion, reason, result) => {
      attempts.set(idempotencyMemoKey(documentId, action, idempotencyKey), {
        rowVersion,
        reason,
        result,
      })
    },
  }
}

/** Arabic 422 problem for a same-key replay whose body differs from the stored attempt. */
export function idempotencyMismatchProblem(): ProblemDetails {
  return problemBase(
    'REQUEST_IDEMPOTENCY_MISMATCH',
    'لا يمكن إعادة استخدام مفتاح التكرار مع طلب مختلف عن الطلب الأصلي.',
    422,
    'idempotencyKey',
  )
}

/**
 * Module-scoped memo for the six lifecycle action routes (D-LIFE-01 §94-97).
 *
 * WHY THIS IS MODULE-SCOPED AND NOT PER-REQUEST
 * ---------------------------------------------
 * An `Idempotency-Key` identifies an INTENT, not a call. The retry that matters
 * is the one that arrives after the first response was lost — which is a fresh
 * request, quite possibly after a re-registration of the routes, and it must
 * still recognise the earlier success. A memo scoped to one handler instance
 * forgets the intent the moment the instance is rebuilt, and the retry then
 * falls through to the rowVersion guard and answers 409 for work that already
 * happened. So the shared instance lives here, at module scope, exactly as the
 * dev mock's `DOCUMENT_ACTION_IDEMPOTENCY` does.
 *
 * This is contract-relevant rather than cosmetic: the backend reads
 * `Idempotency-Key` on exactly five actions (`PostDocumentController.cs:31`,
 * `PostInventoryAdjustmentController.cs:32`, `ReverseInventoryAdjustmentController.cs:29`,
 * `CreateReversalDocumentController.cs:26`, `CompleteWarehouseDocumentDraftController.cs:30`),
 * and `src/shared/services/mutation-safety.ts` mints a key per user intent, so
 * the replay semantics below are the ones the UI depends on.
 *
 * Suite-local isolation is still available: pass an explicit `idempotency`
 * (see `createWarehouseDocumentActionHandler`), which is what keeps one test's
 * stored key out of the next test's document.
 */
export const documentActionIdempotency: IdempotencyMemo = createIdempotencyMemo()

/** Reads the wire header the backend reads; `null` when the caller sent none. */
export function readIdempotencyKey(request: Request): string | null {
  return request.headers.get(IDEMPOTENCY_KEY_HEADER)
}

export interface IdempotentDocumentActionInput {
  action: DocumentActionType
  document: WarehouseDocument
  rowVersion: number
  reason?: string | null
  occurredBy?: LifecycleActorSnapshot | undefined
  /**
   * True when the ROUTE has no reason slot at all — `POST /{documentId}/reversals`
   * takes no body — so the reason-required guard cannot apply to it. The UI still
   * asks the keeper for a reversal reason; the live contract has nowhere to put
   * it, which is recorded rather than faked here.
   */
  reasonNotApplicable?: boolean | undefined
  /** Raw `Idempotency-Key` header value; `null` leaves this attempt unmemoized. */
  idempotencyKey: string | null
  /**
   * The version the memo identifies this INTENT by. Defaults to `rowVersion`,
   * which is the body the client was shown. A bodyless route (`reversals`) has no
   * such version, so it identifies by document + action + key alone — otherwise
   * the retry of a bodyless route could never match, because the record it
   * targets has necessarily moved on by the time the retry arrives.
   */
  idempotencyRowVersion?: number | undefined
  /** Memo to consult and record into; defaults to the module-scoped instance. */
  idempotency?: IdempotencyMemo
}

/**
 * The route-level outcome: everything `applyDocumentAction` can produce, plus
 * the two outcomes only the memo can produce. `status` is carried alongside the
 * failed kinds so an HTTP route answers 422 for a mismatch and 409 for a
 * conflict without re-deriving which is which.
 */
export type IdempotentDocumentActionOutcome =
  | { kind: 'replay'; result: DocumentActionResult }
  | { kind: 'mismatch'; problem: ProblemDetails; status: 422 }
  | { kind: 'conflict'; problem: LifecycleConflictProblemDetails; status: 409 }
  | { kind: 'validation'; problem: ProblemDetails; status: 422 }
  | {
      kind: 'ok'
      document: WarehouseDocument
      result: DocumentActionResult
      compensatingDocument?: WarehouseDocument
    }

/**
 * One lifecycle action as an HTTP route performs it: read the intent key, replay
 * a matching earlier success verbatim, refuse a non-equivalent same-key retry
 * with 422, then apply the transition and — only on success — record the result
 * under that key (D-LIFE-01 §94-97).
 *
 * The memo key uses the RESOLVED document id rather than whatever the caller
 * read out of the path: the memo must identify the record that was actually
 * transitioned, and a handler that echoes an unvalidated path segment into the
 * key would let two spellings of one document store two independent intents.
 *
 * Nothing is stored for a conflict or a validation failure, so a client that
 * retries the same key after fixing the rowVersion gets a fresh attempt rather
 * than a poisoned memo entry.
 */
export function applyIdempotentDocumentAction(
  input: IdempotentDocumentActionInput,
): IdempotentDocumentActionOutcome {
  const memo = input.idempotency ?? documentActionIdempotency
  const documentId = input.document.documentId
  const memoRowVersion = input.idempotencyRowVersion ?? input.rowVersion
  const memoCheck = memo.check({
    idempotencyKey: input.idempotencyKey,
    action: input.action,
    documentId,
    rowVersion: memoRowVersion,
    reason: input.reason ?? null,
  })
  if (memoCheck.kind === 'replay') {
    return { kind: 'replay', result: memoCheck.result }
  }
  if (memoCheck.kind === 'mismatch') {
    return { kind: 'mismatch', problem: idempotencyMismatchProblem(), status: 422 }
  }
  const outcome = applyDocumentAction({
    action: input.action,
    document: input.document,
    rowVersion: input.rowVersion,
    reason: input.reason ?? null,
    reasonNotApplicable: input.reasonNotApplicable ?? false,
    occurredBy: input.occurredBy,
  })
  if (outcome.kind === 'conflict') {
    return { kind: 'conflict', problem: outcome.problem, status: 409 }
  }
  if (outcome.kind === 'validation') {
    return { kind: 'validation', problem: outcome.problem, status: 422 }
  }
  if (input.idempotencyKey !== null) {
    memo.store(
      input.idempotencyKey,
      input.action,
      documentId,
      memoRowVersion,
      input.reason ?? null,
      outcome.result,
    )
  }
  // `outcome` is narrowed to the success variant: its document, result, and
  // optional compensating document are handed to the caller unchanged.
  return outcome
}

let eventIdSequence = 300

function nextEventId(): string {
  eventIdSequence += 1
  return fixtureUuid(eventIdSequence)
}

/**
 * D-LIFE-01 §146-161: reversing a Posted document spawns a compensating
 * document of the opposite direction, created and posted in the same
 * transaction. Mock-level stub: type-valid Posted document, no ledger writes.
 * Per-type mapping decision:
 * - Receiving ↔ Issue (return), Transfer → Transfer (back-transfer),
 *   Adjustment → Adjustment (D-LIFE-01 §105); Opening and Return have no
 *   natural counterpart, so both reverse as an Issue (stock leaves again).
 */
const COMPENSATING_DOCUMENT_TYPES: Readonly<Record<DocumentType, DocumentType>> = {
  Receiving: 'Issue',
  Issue: 'Receiving',
  Transfer: 'Transfer',
  Adjustment: 'Adjustment',
  Opening: 'Issue',
  Return: 'Issue',
}

/** Deterministic, unique-per-call document ids for compensating documents. */
let compensatingDocumentIdSequence = 400
let compensatingAdjustmentIdSequence = 500

function nextCompensatingDocumentId(): string {
  const sequence = compensatingDocumentIdSequence
  compensatingDocumentIdSequence += 1
  return fixtureUuid(sequence)
}

function nextCompensatingAdjustmentId(): string {
  const sequence = compensatingAdjustmentIdSequence
  compensatingAdjustmentIdSequence += 1
  return fixtureUuid(sequence)
}

let compensatingReferenceSequence = 0

function nextCompensatingReference(): string {
  compensatingReferenceSequence += 1
  return `EIAMS-RVS-${String(compensatingReferenceSequence).padStart(4, '0')}`
}

/**
 * Builds the compensating document for a Reverse: a Posted, rowVersion-1
 * mirror of the original with the opposite-direction petal filled. Petals
 * mirror the original where the same counterpart exists (Transfer swaps the
 * destination back to the source warehouse; Issue keeps its recipient;
 * Receiving names the returning counterpart as supplier); everything else
 * falls back to `createWarehouseDocument` defaults.
 */
function buildCompensatingDocument(
  original: WarehouseDocument,
  input: {
    documentId: string
    occurredAt: string
    occurredBy: LifecycleActorSnapshot
    systemReferenceNumber: string
  },
): WarehouseDocument {
  const documentType = COMPENSATING_DOCUMENT_TYPES[original.documentType]
  const actor = { id: input.occurredBy.userId, displayName: input.occurredBy.displayName }
  const petal =
    documentType === 'Transfer'
      ? {
          receivingInfo: undefined,
          transferInfo: {
            destinationWarehouseId: original.warehouse.id,
            destinationWarehouseName: original.warehouse.displayName,
            transferReason:
              original.transferInfo?.transferReason ?? 'نقل عكسي (عكس مستند التحويل الأصلي)',
          },
        }
      : documentType === 'Issue'
        ? {
            issueTo: original.issueTo ?? {
              recipientType: 'Site',
              recipientId: original.site.id,
              recipientDisplayName: original.site.displayName,
              issueReason: 'إرجاع بضاعة (عكس مستند الاستلام الأصلي)',
            },
            receivingInfo: undefined,
          }
        : documentType === 'Receiving'
          ? {
              issueTo: undefined,
              receivingInfo: {
                receivingType: 'Return',
                supplierRef:
                  original.issueTo?.recipientDisplayName ?? original.createdBy.displayName,
                supplierInvoiceRef: null,
              },
            }
          : { receivingInfo: undefined }
  const warehouse =
    documentType === 'Transfer' && original.transferInfo !== undefined
      ? {
          id: original.transferInfo.destinationWarehouseId,
          displayName: original.transferInfo.destinationWarehouseName,
        }
      : original.warehouse
  return createWarehouseDocument({
    ...petal,
    createdAt: input.occurredAt,
    createdBy: actor,
    documentId: input.documentId,
    documentStatus: 'Posted',
    documentType,
    lines: original.lines,
    // D-ATT-01: the compensating document is posted by the same transaction
    // that posted the reversal, so its signed-original gate is satisfied by
    // the reversing document — no advisory may surface on the mirror.
    policy: createDocumentPolicy({
      documentId: input.documentId,
      documentStatus: 'Posted',
      evaluatedAt: input.occurredAt,
      rowVersion: 1,
      signedOriginalSatisfied: true,
    }),
    postedAt: input.occurredAt,
    postedBy: actor,
    rowVersion: 1,
    site: original.site,
    systemReferenceNumber: input.systemReferenceNumber,
    warehouse,
  })
}

export interface DocumentActionInput {
  action: DocumentActionType
  document: WarehouseDocument
  rowVersion: number
  reason?: string | null
  /**
   * True when the calling ROUTE cannot carry a reason — `reversals` takes no body
   * — so the reason-required guard is skipped for it.
   */
  reasonNotApplicable?: boolean
  occurredAt?: string
  occurredBy?: LifecycleActorSnapshot | undefined
}

export type DocumentActionOutcome =
  | { kind: 'conflict'; problem: LifecycleConflictProblemDetails }
  | {
      kind: 'ok'
      document: WarehouseDocument
      result: DocumentActionResult
      /**
       * D-LIFE-01 §146-161: the compensating document produced by a Reverse,
       * returned for the caller to persist; absent for every other action.
       */
      compensatingDocument?: WarehouseDocument
    }
  | { kind: 'validation'; problem: ProblemDetails }

/**
 * Applies one lifecycle action to a document snapshot without side effects:
 * the caller decides where the returned document/event are persisted. Guards,
 * in order: action is a real transition → reason present when required →
 * rowVersion matches (409) → current status is a member of the transition's
 * `from` set (409). On success the rowVersion bumps by one, the policy is
 * re-evaluated for the new status, and a `DocumentActionResult` is produced.
 * A Reverse additionally builds a compensating document (status Posted,
 * mirrored type/petal, unique id and reference) and attaches its
 * `LifecycleDocumentReference` to both the result and the Reversed event.
 */
export function applyDocumentAction(input: DocumentActionInput): DocumentActionOutcome {
  const { action, document } = input
  const transition = DOCUMENT_TRANSITIONS[action]
  if (transition === undefined) {
    return {
      kind: 'validation',
      problem: problemBase(
        'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
        `لا يمكن تنفيذ إجراء «${action}» عبر مسار الحالة.`,
        422,
        'action',
      ),
    }
  }
  if (!input.reasonNotApplicable && actionRequiresReason(action) && !isPresent(input.reason)) {
    return {
      kind: 'validation',
      problem: problemBase('REQUEST_VALIDATION_FAILED', 'يرجى إدخال سبب الإجراء.', 422, 'reason'),
    }
  }
  if (input.rowVersion !== document.rowVersion) {
    return { kind: 'conflict', problem: versionConflictProblem(document) }
  }
  if (!transition.from.includes(document.documentStatus)) {
    return { kind: 'conflict', problem: actionNotAllowedProblem(document, action) }
  }
  if (action === 'Post' && !document.policy.signedOriginalSatisfied) {
    return { kind: 'validation', problem: signedOriginalMissingProblem() }
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const occurredBy = input.occurredBy ?? DEFAULT_ACTOR
  const nextRowVersion = document.rowVersion + 1
  const postedFields =
    transition.to === 'Posted'
      ? {
          postedAt: occurredAt,
          postedBy: { id: occurredBy.userId, displayName: occurredBy.displayName },
        }
      : {}
  const updated: WarehouseDocument = {
    ...document,
    ...postedFields,
    documentStatus: transition.to,
    rowVersion: nextRowVersion,
    policy: {
      ...document.policy,
      actions: actionsForDocumentPolicy(transition.to, document.policy.signedOriginalSatisfied),
      blockers:
        transition.to === 'Submitted' && !document.policy.signedOriginalSatisfied
          ? document.policy.blockers.some(
              (blocker) => blocker.code === SIGNED_ORIGINAL_MISSING_CODE,
            )
            ? document.policy.blockers
            : [
                ...document.policy.blockers,
                createPolicyBlocker({
                  field: 'attachmentType',
                  messageAr: SIGNED_ORIGINAL_MISSING_DETAIL_AR,
                }),
              ]
          : document.policy.blockers,
      documentStatus: transition.to,
      evaluatedAt: occurredAt,
      rowVersion: nextRowVersion,
    },
  }
  let compensatingDocument: WarehouseDocument | undefined
  if (action === 'Reverse') {
    compensatingDocument = buildCompensatingDocument(document, {
      documentId: nextCompensatingDocumentId(),
      occurredAt,
      occurredBy,
      systemReferenceNumber: nextCompensatingReference(),
    })
  }
  const relatedDocument: LifecycleDocumentReference | undefined =
    compensatingDocument === undefined
      ? undefined
      : {
          documentId: compensatingDocument.documentId,
          documentType: compensatingDocument.documentType,
          status: compensatingDocument.documentStatus,
          systemReferenceNumber: compensatingDocument.systemReferenceNumber,
          ...(compensatingDocument.documentType === 'Adjustment'
            ? { adjustmentId: nextCompensatingAdjustmentId() }
            : {}),
        }
  const lifecycleEvent = createLifecycleEvent({
    correlationId: null,
    documentId: document.documentId,
    documentRowVersion: nextRowVersion,
    eventId: nextEventId(),
    eventType: transition.eventType,
    fromStatus: document.documentStatus,
    occurredAt,
    occurredBy,
    reason: actionRequiresReason(action) ? (input.reason ?? null) : null,
    toStatus: transition.to,
    ...(relatedDocument === undefined ? {} : { relatedDocument }),
  })
  return {
    kind: 'ok',
    document: updated,
    result: {
      document: updated,
      lifecycleEvent,
      ...(relatedDocument === undefined ? {} : { relatedDocument }),
    },
    ...(compensatingDocument === undefined ? {} : { compensatingDocument }),
  }
}

export interface DocumentListHandlerOptions {
  /** Simulated network latency; defaults to 0 so suites stay fast. */
  delayMs?: number
}

/** GET /warehouse-documents — paged list with contract query-parameter filtering. */
export function createWarehouseDocumentListHandler(
  documents: readonly WarehouseDocument[],
  options: DocumentListHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.get(DOCUMENT_PREFIX, async ({ request }) => {
      await delay(options.delayMs ?? 0)
      const query = parseDocumentListQuery(new URL(request.url))
      const filtered = documents.filter(
        (document) =>
          (query.documentStatus === undefined ||
            document.documentStatus === query.documentStatus) &&
          (query.documentType === undefined || document.documentType === query.documentType) &&
          (query.warehouseId === undefined || document.warehouse.id === query.warehouseId) &&
          contains(document.systemReferenceNumber, query.systemReferenceNumber) &&
          contains(document.paperDocumentNumber, query.paperDocumentNumber),
      )
      // One-based `page`, so page 1 is the first slice.
      const start = (query.page - 1) * query.pageSize
      // Serves the wire envelope, not `{items, meta}`. The backend wraps every
      // response in `ApiResponse<T>(Success, Data, Pagination, Meta)`; a bare UI
      // page here made the shared `ApiTransport` read `data`/`pagination` off
      // undefined and return an empty page, which is what eiams-frontend-3abe
      // exposed once the document services moved onto the transport.
      return okPageJson(filtered.slice(start, start + query.pageSize).map(toWireSummary), {
        page: query.page,
        pageSize: query.pageSize,
        totalCount: filtered.length,
        totalPages: totalPageCount(filtered.length, query.pageSize),
      })
    }),
  ]
}

/** GET /warehouse-documents/:documentId — detail or Arabic 404 problem. */
export function createWarehouseDocumentDetailHandler(
  document: WarehouseDocument,
  options: DocumentListHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.get(`${DOCUMENT_PREFIX}/:documentId`, async ({ params }) => {
      await delay(options.delayMs ?? 0)
      return params['documentId'] === document.documentId
        ? okJson(toWireDetails(document))
        : notFound()
    }),
  ]
}

const EMPTY_HISTORY_STATUS: DocumentStatus = 'Draft'

/** GET /warehouse-documents/:documentId/history — immutable event chain. */
export function createWarehouseDocumentHistoryHandler(
  events: readonly DocumentLifecycleEvent[],
  options: DocumentListHandlerOptions & {
    currentStatus?: DocumentStatus
    currentRowVersion?: number
  } = {},
): readonly HttpHandler[] {
  const lastEvent = events[events.length - 1]
  const documentId = lastEvent?.documentId ?? ''
  return [
    http.get(`${DOCUMENT_PREFIX}/:documentId/history`, async ({ params }) => {
      await delay(options.delayMs ?? 0)
      if (params['documentId'] !== documentId) {
        return notFound()
      }
      return okJson(
        toWireHistory(
          documentId,
          events,
          options.currentStatus ?? lastEvent?.toStatus ?? EMPTY_HISTORY_STATUS,
          options.currentRowVersion ?? lastEvent?.documentRowVersion ?? 0,
        ),
      )
    }),
  ]
}

/**
 * GET /warehouse-documents/:documentId/policy — evaluated action availability.
 *
 * Takes the in-memory document and projects its policy, because the wire policy
 * and the harness policy are two spellings of one evaluation (`status`/`warnings`
 * and code-resolved reasons) rather than two separate objects.
 */
export function createWarehouseDocumentPolicyHandler(
  document: WarehouseDocument,
  options: DocumentListHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.get(`${DOCUMENT_PREFIX}/:documentId/policy`, async ({ params }) => {
      await delay(options.delayMs ?? 0)
      return params['documentId'] === document.documentId
        ? okJson(toWirePolicy(document))
        : notFound()
    }),
  ]
}

export interface DocumentActionHandlerOptions {
  /** Seed record the action routes operate on (and mutate on success). */
  initialDocument: WarehouseDocument
  /**
   * Optional live collection to read/write the record — pass a mutable array
   * (e.g. your test fixture array) so callers can assert the mutated state
   * after the request; when omitted, `onDocumentUpdated` is the mutation hook.
   */
  documentStore?: () => WarehouseDocument[]
  /** Called after a successful transition, before the 200 response is sent. */
  onDocumentUpdated?: (document: WarehouseDocument, action: DocumentActionType) => void
  /**
   * Called with the lifecycle event one transition appended, before the
   * acknowledgement. The live routes answer `EmptyResponse` /
   * `PostDocumentResponse` / `201 { id }` and carry no event, so a test that
   * needs to assert "exactly one event per accepted action" has no other way to
   * observe the chain the route wrote.
   */
  onLifecycleEvent?: (event: DocumentLifecycleEvent, action: DocumentActionType) => void
  /** Called after a successful Reverse, before the 200 response, with the compensating document. */
  onCompensatingDocumentCreated?: (document: WarehouseDocument) => void
  occurredBy?: LifecycleActorSnapshot
  delayMs?: number
}

/**
 * The six lifecycle action POSTs (submit / post / reject / return-to-draft /
 * cancel / reversals) wired to one mutable in-memory document record. Replays the
 * same transition engine the dev mock API uses, so engine tests and `pnpm dev`
 * agree on rowVersion (409), reason (422), transition guards, and `Idempotency-Key`
 * replay/mismatch.
 *
 * The memo handed to `applyIdempotentDocumentAction` is PER HANDLER SET, not the
 * module-scoped one. These handlers exist to serve one test, and a test that
 * registers a document, runs an action, then registers another document must not
 * inherit the first test's stored key. Suites that model the dev mock's
 * long-lived process — where one key spans route re-registrations — use
 * `applyIdempotentDocumentAction` directly with the module-scoped memo.
 */
/**
 * One lifecycle route's wire answer.
 *
 * The live routes are deliberately asymmetric, and a harness that answered one
 * envelope for all six would hide the very distinction the transport was
 * rewritten for:
 *  - `reversals` creates the compensating document and answers `201 { id }` for
 *    the NEW document;
 *  - `post` answers `PostDocumentResponse` (warnings included);
 *  - submit / return-to-draft / reject / cancel answer `EmptyResponse`.
 *
 * A replay under the same `Idempotency-Key` answers what the original attempt
 * answered, so it routes through here too rather than through a second spelling.
 */
function lifecycleRouteAnswer(
  action: DocumentActionType,
  document: WarehouseDocument,
  reversalDocumentId: string | null,
) {
  if (action === 'Reverse' && reversalDocumentId !== null) {
    return apiJson({ id: reversalDocumentId }, { status: 201 })
  }
  if (action === 'Post') {
    return okJson(toWirePostResult(document))
  }
  return okJson({})
}

export function createWarehouseDocumentActionHandler(
  options: DocumentActionHandlerOptions,
): readonly HttpHandler[] {
  let current = options.initialDocument
  const idempotency = createIdempotencyMemo()
  return DOCUMENT_ACTION_ROUTES.map(([action, suffix]) =>
    http.post(`${DOCUMENT_PREFIX}/:documentId/${suffix}`, async ({ params, request }) => {
      await delay(options.delayMs ?? 0)
      const documentId = String(params['documentId'])
      const store = options.documentStore?.()
      const stored = store?.find((item) => item.documentId === documentId)
      const document = stored ?? (current.documentId === documentId ? current : undefined)
      if (document === undefined) {
        return notFound()
      }
      // The live body field is `expectedRowVersion` on every action, and the
      // reasoned three additionally carry `reason`. The snapshot's `VersionOnly…`
      // / `Reasoned…` pair is only the reason split; the version key differs.
      // `reversals` reads no body at all.
      const body =
        action === 'Reverse'
          ? ({} as { expectedRowVersion?: number; reason?: string | null })
          : ((await request.json()) as {
              expectedRowVersion?: number
              reason?: string | null
            })

      const outcome = applyIdempotentDocumentAction({
        action,
        document,
        rowVersion:
          // `reversals` carries no version in a body, so the route evaluates the
          // record it just read; every other action guards on the version the
          // client was shown and a missing field is a client bug, not a fallback.
          action === 'Reverse' ? document.rowVersion : (body.expectedRowVersion ?? 0),
        reason: body.reason ?? null,
        // `reversals` has no body slot at all, so the reversal reason the UI
        // collects has nowhere to travel and the route cannot enforce one it
        // never receives. Every other action carries its reason in the body and
        // is guarded on it (422 when absent).
        reasonNotApplicable: action === 'Reverse',
        // A bodyless route identifies its intent by document + action + key only.
        ...(action === 'Reverse' ? { idempotencyRowVersion: 0 } : {}),
        occurredBy: options.occurredBy,
        idempotencyKey: readIdempotencyKey(request),
        idempotency,
      })
      if (outcome.kind !== 'ok') {
        if (outcome.kind === 'replay') {
          return lifecycleRouteAnswer(
            action,
            outcome.result.document,
            outcome.result.relatedDocument?.documentId ?? null,
          )
        }
        return toWireErrorResponse(outcome.problem, outcome.status)
      }
      current = outcome.document
      if (store !== undefined) {
        const index = store.findIndex((item) => item.documentId === documentId)
        if (index !== -1) {
          store[index] = outcome.document
        }
      }
      options.onDocumentUpdated?.(outcome.document, action)
      options.onLifecycleEvent?.(outcome.result.lifecycleEvent, action)
      if (outcome.compensatingDocument !== undefined) {
        options.onCompensatingDocumentCreated?.(outcome.compensatingDocument)
      }
      return lifecycleRouteAnswer(
        action,
        outcome.document,
        outcome.compensatingDocument?.documentId ?? null,
      )
    }),
  )
}
// ---------------------------------------------------------------------------
// Draft persistence
//
// There is exactly ONE write that creates a document together with its lines:
// `POST /warehouse-documents/complete-draft`, and it answers the whole detail
// read. The bare `POST /warehouse-documents` route creates an EMPTY document and
// answers `201 { id }`; `PUT /warehouse-documents/{id}` DOES NOT EXIST, so a saved
// draft cannot be amended from the UI at all. The paper number/year live on a
// second route, `PUT /{id}/paper-reference`.
// ---------------------------------------------------------------------------

const DEFAULT_DRAFT_ACTOR: LifecycleActorSnapshot = {
  userId: fixtureUuid(10),
  displayName: 'مستخدم تجريبي',
  roleNameAr: 'أمين المستودع',
}

const SYSTEM_REFERENCE_PREFIX: Readonly<Record<DocumentType, string>> = {
  Adjustment: 'ADJ',
  Issue: 'ISS',
  Opening: 'OPN',
  Receiving: 'RCV',
  Return: 'RTN',
  Transfer: 'TRF',
}

export interface DraftLookups {
  /** Resolves a draft line's material (full Material snapshot per contract). */
  materialOf: (materialId: string) => Material | undefined
  /** Resolves a draft line's selected unit; `undefined` for the base unit. */
  unitOf: (unitId: string | undefined) => NamedReference | undefined
  /** Resolves the document warehouse. */
  warehouseOf: (warehouseId: string) => Warehouse | undefined
  /**
   * Resolves a site by id.
   *
   * A `Warehouse` carries a FLAT `siteId` and no nested site snapshot, so the
   * document's `site` reference has to be joined against the sites list — the
   * wire record a warehouse returns is not enough to name its own site.
   */
  siteOf: (siteId: string) => Site | undefined
}

const FALLBACK_LOOKUPS: DraftLookups = {
  materialOf: (materialId) => createMaterial({ id: materialId }),
  unitOf: (unitId) => (unitId === undefined ? undefined : createNamedReference({ id: unitId })),
  warehouseOf: (warehouseId) => createWarehouse({ id: warehouseId }),
  siteOf: (siteId) => createSite({ id: siteId }),
}

function resolveLookups(lookups: Partial<DraftLookups> | undefined): DraftLookups {
  return { ...FALLBACK_LOOKUPS, ...lookups }
}

function mapDraftLine(
  input: CompleteDraftLine,
  index: number,
  lookups: DraftLookups,
): DocumentLine {
  const material = lookups.materialOf(input.materialId) ?? createMaterial({ id: input.materialId })
  // `materialOf` resolves the REAL catalog record; the line still embeds the
  // generated shape, so the identity/labels are carried across the boundary by
  // the same projection `createWarehouseDocumentLine` uses. A snapshot taken at
  // draft time must name the same material and unit the posted line will.
  const unit =
    lookups.unitOf(input.unitId ?? undefined) ??
    createNamedReference({ id: material.baseUnitId, displayName: material.baseUnitSymbol })
  return {
    // D-IAR-01: Issue lines reference existing assets by id; the draft keeps
    // them verbatim and posting freezes the resolved set (mock parity).
    ...(input.assetIds === undefined ? {} : { assetIds: input.assetIds }),
    // Receiving/Opening lines register one NEW asset per unit. The live command
    // carries the captured identity as `assetInputs`, and dropping it here would
    // silently lose every asset number and serial the keeper typed, because
    // `toWireLine` below reads exactly this member. A `null` collection is
    // treated as absent rather than stored, since the harness member is
    // non-nullable.
    ...(input.assetInputs == null ? {} : { assetInputs: input.assetInputs }),
    availableBalance: null,
    baseQuantity: input.quantity ?? 0,
    batchNumber: input.batchNumber ?? null,
    conversionFactor: '1.000000',
    conversionId: null,
    expiryDate: input.expiryDate ?? null,
    lineId: fixtureUuid(201 + index),
    lineType: material.materialKind === 'Asset' ? 'Asset' : 'Normal',
    material: toDocumentLineMaterial(material),
    ...(input.openingType === undefined || input.openingType === null
      ? {}
      : { openingType: input.openingType }),
    quantity: input.quantity ?? 0,
    unit,
    unitPrice: input.unitPrice ?? null,
  }
}

function mapDraftLines(lines: readonly CompleteDraftLine[], lookups: DraftLookups): DocumentLine[] {
  return lines.map((line, index) => mapDraftLine(line, index, lookups))
}

function namedActor(actor: LifecycleActorSnapshot): NamedReference {
  return createNamedReference({ id: actor.userId, displayName: actor.displayName })
}

/**
 * The document spine's warehouse/site reference pair, derived from the flat wire
 * shape: the warehouse reference reads `id`/`name`, and the site reference is
 * joined from `warehouse.siteId` through the sites lookup because the warehouse
 * record itself carries no site label.
 */
function draftWarehouseReferences(
  warehouse: Warehouse,
  lookups: DraftLookups,
): { site: NamedReference; warehouse: NamedReference } {
  const site = lookups.siteOf(warehouse.siteId) ?? createSite({ id: warehouse.siteId })
  return {
    site: createNamedReference({ id: site.id, displayName: site.name }),
    warehouse: createNamedReference({ id: warehouse.id, displayName: warehouse.name }),
  }
}

/**
 * Builds a complete Draft `WarehouseDocument` from a `CompleteDraftRequest` —
 * the shared shape the complete-draft handler persists. Petals
 * (receiving/issue/transfer/return) pass through untouched; the spine
 * (warehouse/site, lines) is derived. The paper reference is NOT part of the
 * command, so it stays at the harness defaults until the `paper-reference` route
 * writes it.
 */
export function buildCompleteDraftDocument(
  request: CompleteDraftRequest,
  options: {
    documentId: string
    systemReferenceNumber: string
    occurredBy?: LifecycleActorSnapshot
    lookups?: Partial<DraftLookups>
    createdAt?: string
  },
): WarehouseDocument {
  const lookups = resolveLookups(options.lookups)
  const actor = options.occurredBy ?? DEFAULT_DRAFT_ACTOR
  const warehouse =
    lookups.warehouseOf(request.warehouseId) ?? createWarehouse({ id: request.warehouseId })
  const references = draftWarehouseReferences(warehouse, lookups)
  // `Warehouse` carries optional members under `exactOptionalPropertyTypes`, and
  // the harness's generated `NamedReference` wants the ones it reads. Narrow the
  // three the document spine actually embeds rather than asserting the shape.
  const warehouseReference: NamedReference = {
    id: references.warehouse.id,
    displayName: references.warehouse.displayName,
  }
  return {
    attachments: [],
    createdAt: options.createdAt ?? new Date().toISOString(),
    createdBy: namedActor(actor),
    documentId: options.documentId,
    documentStatus: 'Draft',
    documentType: request.documentType,
    ...(request.issueTo === undefined || request.issueTo === null
      ? {}
      : {
          issueTo: {
            recipientType: request.issueTo.recipientType,
            recipientId: request.issueTo.recipientId,
            issueReason: request.issueTo.issueReason,
            recipientDisplayName: '',
          },
        }),
    lines: mapDraftLines(request.lines, lookups),
    paperDocumentNumber: '2024/123',
    paperDocumentYear: 2024,
    policy: createDocumentPolicy({
      documentId: options.documentId,
      documentStatus: 'Draft',
      rowVersion: 1,
    }),
    postedAt: null,
    ...(request.receivingInfo === undefined || request.receivingInfo === null
      ? {}
      : {
          receivingInfo: {
            receivingType: 'Supplier',
            supplierRef: request.receivingInfo.supplierRef,
            supplierInvoiceRef: request.receivingInfo.supplierInvoiceRef ?? null,
          },
        }),
    ...(request.returnInfo === undefined || request.returnInfo === null
      ? {}
      : {
          returnInfo: {
            originalIssueDocumentId: request.returnInfo.originalIssueDocumentId,
            returnReason: request.returnInfo.returnReason,
          },
        }),
    rowVersion: 1,
    site: { id: references.site.id, displayName: references.site.displayName },
    systemReferenceNumber: options.systemReferenceNumber,
    ...(request.transferInfo === undefined || request.transferInfo === null
      ? {}
      : {
          transferInfo: {
            destinationWarehouseId: request.transferInfo.destinationWarehouseId,
            destinationWarehouseName:
              lookups.warehouseOf(request.transferInfo.destinationWarehouseId)?.name ?? '—',
            transferReason: request.transferInfo.transferReason,
          },
        }),
    warehouse: warehouseReference,
  }
}

export interface DraftPersistenceHandlerOptions {
  /** Live collection the record is written into. */
  documentStore?: () => WarehouseDocument[]
  /** Called after a successful create, before the 201 response. */
  onDocumentCreated?: (document: WarehouseDocument) => void
  /** Actor stamped on created documents (`createdBy`). */
  occurredBy?: LifecycleActorSnapshot
  lookups?: Partial<DraftLookups>
  /** Per-document-type system reference; defaults to `EIAMS-<PREFIX>-<year>-0001`. */
  nextSystemReference?: (request: CompleteDraftRequest) => string
  delayMs?: number
}

const DEFAULT_REFERENCE_SEQUENCE = '0001'

/**
 * POST /warehouse-documents/complete-draft — creates a Draft document WITH its
 * lines and answers the whole `WarehouseDocumentDetails` read.
 */
export function createCompleteDraftHandler(
  options: DraftPersistenceHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.post(`${DOCUMENT_PREFIX}/complete-draft`, async ({ request }) => {
      await delay(options.delayMs ?? 0)
      const body = (await request.json()) as CompleteDraftRequest
      const reference =
        options.nextSystemReference?.(body) ??
        `EIAMS-${SYSTEM_REFERENCE_PREFIX[body.documentType]}-2024-${DEFAULT_REFERENCE_SEQUENCE}`
      const document = buildCompleteDraftDocument(body, {
        documentId: fixtureUuid(900),
        systemReferenceNumber: reference,
        ...(options.occurredBy === undefined ? {} : { occurredBy: options.occurredBy }),
        ...(options.lookups === undefined ? {} : { lookups: options.lookups }),
      })
      const store = options.documentStore?.()
      if (store !== undefined) {
        store.push(document)
      }
      options.onDocumentCreated?.(document)
      return apiJson(toWireDetails(document), { status: 201 })
    }),
  ]
}

/**
 * PUT /warehouse-documents/:documentId/paper-reference — the second half of a
 * draft save, guarded on the version the complete-draft call just issued.
 */
export function createPaperReferenceHandler(
  options: DocumentPersistenceHandlerOptions,
): readonly HttpHandler[] {
  let current = options.initialDocument
  return [
    http.put(`${DOCUMENT_PREFIX}/:documentId/paper-reference`, async ({ params, request }) => {
      await delay(options.delayMs ?? 0)
      const documentId = String(params['documentId'])
      const store = options.documentStore?.()
      const stored = store?.find((item) => item.documentId === documentId)
      const document = stored ?? (current.documentId === documentId ? current : undefined)
      if (document === undefined) {
        return notFound()
      }
      const body = (await request.json()) as {
        expectedRowVersion: number
        paperDocumentNumber: string
        paperDocumentYear: number
      }
      if (body.expectedRowVersion !== document.rowVersion) {
        return toWireErrorResponse(versionConflictProblem(document), 409)
      }
      const updated: WarehouseDocument = {
        ...document,
        paperDocumentNumber: body.paperDocumentNumber,
        paperDocumentYear: body.paperDocumentYear,
        rowVersion: document.rowVersion + 1,
      }
      current = updated
      const list = store
      if (list !== undefined) {
        const index = list.findIndex((item) => item.documentId === documentId)
        if (index !== -1) {
          list[index] = updated
        }
      }
      options.onDocumentUpdated?.(updated)
      return okJson({})
    }),
  ]
}

export interface DocumentPersistenceHandlerOptions {
  initialDocument: WarehouseDocument
  documentStore?: () => WarehouseDocument[]
  onDocumentUpdated?: (document: WarehouseDocument) => void
  delayMs?: number
}
