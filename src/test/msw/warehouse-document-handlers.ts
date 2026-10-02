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
  createWarehouse,
  createWarehouseDocument,
  DOCUMENT_TRANSITIONS,
  fixtureUuid,
} from '@/test/msw/factories'
import { apiJson, okJson, okPageJson, toWireErrorResponse } from '@/test/msw/envelope'
import type {
  DocumentActionType,
  DocumentActionResult,
  DocumentLifecycleEvent,
  DocumentLine,
  DocumentLineInput,
  DocumentPolicy,
  DocumentStatus,
  DocumentType,
  LifecycleActorSnapshot,
  LifecycleConflictProblemDetails,
  LifecycleDocumentReference,
  Material,
  NamedReference,
  ProblemDetails,
  ReasonedDocumentActionRequest,
  VersionOnlyDocumentActionRequest,
  Warehouse,
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * Scenario handler builders for the shared document engine.
 *
 * These functions return MSW handler arrays (registered via `server.use(...)`)
 * so document-engine tests — list filtering, detail, history, policy, and the
 * six lifecycle action POSTs — exercise the exact contract shapes the deleted
 * dev mock API used to serve. The transition engine (`applyDocumentAction`) is
 * the single implementation it shared with `src/mocks/handlers.ts`: same
 * rowVersion guard, same reason validation, same state-transition table, same
 * 409 problem body.
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
  ['Reverse', 'reverse'],
  ['Revise', 'revise'],
  ['Submit', 'submit'],
]

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
  search?: string
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
  const search = url.searchParams.get('search')
  if (search !== null) {
    query.search = search
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

function matchesSearch<Record>(
  record: Record,
  search: string | undefined,
  textOf: (record: Record) => string,
): boolean {
  if (search === undefined) {
    return true
  }
  return textOf(record).toLowerCase().includes(search.toLowerCase())
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
  /** Raw `Idempotency-Key` header value; `null` leaves this attempt unmemoized. */
  idempotencyKey: string | null
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
  const memoCheck = memo.check({
    idempotencyKey: input.idempotencyKey,
    action: input.action,
    documentId,
    rowVersion: input.rowVersion,
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
      input.rowVersion,
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
    policy: createDocumentPolicy({
      documentId: input.documentId,
      documentStatus: 'Posted',
      evaluatedAt: input.occurredAt,
      rowVersion: 1,
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
  if (actionRequiresReason(action) && !isPresent(input.reason)) {
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
          matchesSearch(
            document,
            query.search,
            (item) => `${item.paperDocumentNumber} ${item.systemReferenceNumber}`,
          ),
      )
      // One-based `page`, so page 1 is the first slice.
      const start = (query.page - 1) * query.pageSize
      // Serves the wire envelope, not `{items, meta}`. The backend wraps every
      // response in `ApiResponse<T>(Success, Data, Pagination, Meta)`; a bare UI
      // page here made the shared `ApiTransport` read `data`/`pagination` off
      // undefined and return an empty page, which is what eiams-frontend-3abe
      // exposed once the document services moved onto the transport.
      return okPageJson(filtered.slice(start, start + query.pageSize), {
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
      return params['documentId'] === document.documentId ? okJson(document) : notFound()
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
      return okJson({
        documentId,
        currentStatus: options.currentStatus ?? lastEvent?.toStatus ?? EMPTY_HISTORY_STATUS,
        currentRowVersion: options.currentRowVersion ?? lastEvent?.documentRowVersion ?? 0,
        events,
      })
    }),
  ]
}

/** GET /warehouse-documents/:documentId/policy — evaluated action availability. */
export function createWarehouseDocumentPolicyHandler(
  policy: DocumentPolicy,
  options: DocumentListHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.get(`${DOCUMENT_PREFIX}/:documentId/policy`, async ({ params }) => {
      await delay(options.delayMs ?? 0)
      return params['documentId'] === policy.documentId ? okJson(policy) : notFound()
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
  /** Called after a successful Reverse, before the 200 response, with the compensating document. */
  onCompensatingDocumentCreated?: (document: WarehouseDocument) => void
  occurredBy?: LifecycleActorSnapshot
  delayMs?: number
}

/**
 * The six lifecycle action POSTs (submit/post/reject/revise/cancel/reverse)
 * wired to one mutable in-memory document record. Replays the same transition
 * engine the dev mock API uses, so engine tests and `pnpm dev` agree on
 * rowVersion (409), reason (422), transition guards, and `Idempotency-Key`
 * replay/mismatch.
 *
 * The memo handed to `applyIdempotentDocumentAction` is PER HANDLER SET, not the
 * module-scoped one. These handlers exist to serve one test, and a test that
 * registers a document, runs an action, then registers another document must not
 * inherit the first test's stored key. Suites that model the dev mock's
 * long-lived process — where one key spans route re-registrations — use
 * `applyIdempotentDocumentAction` directly with the module-scoped memo.
 */
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
      const body = (await request.json()) as
        VersionOnlyDocumentActionRequest | ReasonedDocumentActionRequest
      const outcome = applyIdempotentDocumentAction({
        action,
        document,
        rowVersion: body.rowVersion,
        reason: 'reason' in body ? (body.reason ?? null) : null,
        occurredBy: options.occurredBy,
        idempotencyKey: readIdempotencyKey(request),
        idempotency,
      })
      if (outcome.kind !== 'ok') {
        if (outcome.kind === 'replay') {
          return okJson(outcome.result)
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
      if (outcome.compensatingDocument !== undefined) {
        options.onCompensatingDocumentCreated?.(outcome.compensatingDocument)
      }
      return okJson(outcome.result)
    }),
  )
}

// ---------------------------------------------------------------------------
// Draft persistence (create / update)
//
// POST/PUT /warehouse-documents are shared by every document module (the
// spine draft endpoints). The draft engine below mirrors the contract:
// - POST builds a Draft document (rowVersion 1, Created policy) from a
//   WarehouseDocumentDraftRequest and persists it into an optional store.
// - PUT applies the request onto an existing record and bumps both the
//   document and its policy rowVersion — mismatches answer the same 409
//   `versionConflictProblem` the lifecycle engine uses.
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
  /** Resolves the document warehouse (site snapshot comes from it). */
  warehouseOf: (warehouseId: string) => Warehouse | undefined
}

const FALLBACK_LOOKUPS: DraftLookups = {
  materialOf: (materialId) => createMaterial({ materialId }),
  unitOf: (unitId) => (unitId === undefined ? undefined : createNamedReference({ id: unitId })),
  warehouseOf: (warehouseId) => createWarehouse({ warehouseId }),
}

function resolveLookups(lookups: Partial<DraftLookups> | undefined): DraftLookups {
  return { ...FALLBACK_LOOKUPS, ...lookups }
}

function mapDraftLine(
  input: DocumentLineInput,
  index: number,
  lookups: DraftLookups,
): DocumentLine {
  const material =
    lookups.materialOf(input.materialId) ?? createMaterial({ materialId: input.materialId })
  const unit = lookups.unitOf(input.unitId) ?? material.baseUnit
  return {
    ...(input.assetInputs === undefined ? {} : { assetInputs: input.assetInputs }),
    // D-IAR-01: Issue lines reference existing assets by id; the draft keeps
    // them verbatim and posting freezes the resolved set (mock parity).
    ...(input.assetIds === undefined ? {} : { assetIds: input.assetIds }),
    availableBalance: null,
    baseQuantity: input.baseQuantity ?? input.quantity,
    batchNumber: input.batchNumber ?? null,
    conversionFactor: input.conversionFactor ?? '1.000000',
    conversionId: input.conversionId ?? null,
    expiryDate: input.expiryDate ?? null,
    lineId: input.lineId ?? fixtureUuid(201 + index),
    lineType: material.materialKind === 'Asset' ? 'Asset' : 'Normal',
    material,
    ...(input.openingType === undefined ? {} : { openingType: input.openingType }),
    quantity: input.quantity,
    unit,
    unitPrice: input.unitPrice ?? null,
  }
}

function mapDraftLines(lines: readonly DocumentLineInput[], lookups: DraftLookups): DocumentLine[] {
  return lines.map((line, index) => mapDraftLine(line, index, lookups))
}

function namedActor(actor: LifecycleActorSnapshot): NamedReference {
  return createNamedReference({ id: actor.userId, displayName: actor.displayName })
}

/**
 * Builds a complete Draft `WarehouseDocument` from a
 * `WarehouseDocumentDraftRequest` — the shared shape the create handler and
 * the dev mock both persist. Petals (receiving/issue/transfer/return) pass
 * through untouched; the spine (header, warehouse/site, lines) is derived.
 */
export function buildDraftDocument(
  request: WarehouseDocumentDraftRequest,
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
    lookups.warehouseOf(request.warehouseId) ??
    createWarehouse({ warehouseId: request.warehouseId })
  return {
    attachments: [],
    createdAt: options.createdAt ?? new Date().toISOString(),
    createdBy: namedActor(actor),
    documentId: options.documentId,
    documentStatus: 'Draft',
    documentType: request.documentType,
    ...(request.issueTo === undefined ? {} : { issueTo: request.issueTo }),
    lines: mapDraftLines(request.lines, lookups),
    paperDocumentNumber: request.paperDocumentNumber,
    paperDocumentYear: request.paperDocumentYear,
    policy: createDocumentPolicy({
      documentId: options.documentId,
      documentStatus: 'Draft',
      rowVersion: 1,
    }),
    postedAt: null,
    ...(request.receivingInfo === undefined ? {} : { receivingInfo: request.receivingInfo }),
    ...(request.returnInfo === undefined ? {} : { returnInfo: request.returnInfo }),
    rowVersion: 1,
    site: warehouse.site,
    systemReferenceNumber: options.systemReferenceNumber,
    ...(request.transferInfo === undefined ? {} : { transferInfo: request.transferInfo }),
    warehouse: createNamedReference({ id: warehouse.warehouseId, displayName: warehouse.nameAr }),
  }
}

/**
 * Applies a draft request onto an existing document (PUT semantics): replaces
 * header, lines, and petals; bumps document and policy rowVersion by one. The
 * lifecycle event chain and immutable spine fields are left untouched.
 */
export function applyDraftToDocument(
  document: WarehouseDocument,
  request: WarehouseDocumentDraftRequest,
  lookups: Partial<DraftLookups> | undefined = undefined,
): WarehouseDocument {
  const resolved = resolveLookups(lookups)
  const warehouse =
    resolved.warehouseOf(request.warehouseId) ??
    createWarehouse({ warehouseId: request.warehouseId })
  const nextRowVersion = document.rowVersion + 1
  return {
    ...document,
    documentType: request.documentType,
    ...(request.issueTo === undefined ? {} : { issueTo: request.issueTo }),
    lines: mapDraftLines(request.lines, resolved),
    paperDocumentNumber: request.paperDocumentNumber,
    paperDocumentYear: request.paperDocumentYear,
    policy: createDocumentPolicy({
      documentId: document.documentId,
      documentStatus: document.documentStatus,
      rowVersion: nextRowVersion,
    }),
    ...(request.receivingInfo === undefined ? {} : { receivingInfo: request.receivingInfo }),
    ...(request.returnInfo === undefined ? {} : { returnInfo: request.returnInfo }),
    rowVersion: nextRowVersion,
    site: warehouse.site,
    ...(request.transferInfo === undefined ? {} : { transferInfo: request.transferInfo }),
    warehouse: createNamedReference({ id: warehouse.warehouseId, displayName: warehouse.nameAr }),
  }
}

export interface DraftPersistenceHandlerOptions {
  /** Live collection the record is read from / written into on PUT. */
  documentStore?: () => WarehouseDocument[]
  /** Called after a successful create, before the 201 response. */
  onDocumentCreated?: (document: WarehouseDocument) => void
  /** Called after a successful update, before the 200 response. */
  onDocumentUpdated?: (document: WarehouseDocument) => void
  /** Actor stamped on created documents (`createdBy`). */
  occurredBy?: LifecycleActorSnapshot
  lookups?: Partial<DraftLookups>
  /** Per-document-type system reference; defaults to `EIAMS-<PREFIX>-<year>-0001`. */
  nextSystemReference?: (request: WarehouseDocumentDraftRequest) => string
  delayMs?: number
}

const DEFAULT_REFERENCE_SEQUENCE = '0001'

/** POST /warehouse-documents — creates a Draft from the request body. */
export function createWarehouseDocumentCreateHandler(
  options: DraftPersistenceHandlerOptions = {},
): readonly HttpHandler[] {
  return [
    http.post(DOCUMENT_PREFIX, async ({ request }) => {
      await delay(options.delayMs ?? 0)
      const body = (await request.json()) as WarehouseDocumentDraftRequest
      const reference =
        options.nextSystemReference?.(body) ??
        `EIAMS-${SYSTEM_REFERENCE_PREFIX[body.documentType]}-${body.paperDocumentYear}-${DEFAULT_REFERENCE_SEQUENCE}`
      const document = buildDraftDocument(body, {
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
      return apiJson(document, { status: 201 })
    }),
  ]
}

/** PUT /warehouse-documents/:documentId — applies a draft request with a rowVersion guard. */
export function createWarehouseDocumentUpdateHandler(
  options: DraftPersistenceHandlerOptions & {
    initialDocument: WarehouseDocument
  },
): readonly HttpHandler[] {
  let current = options.initialDocument
  return [
    http.put(`${DOCUMENT_PREFIX}/:documentId`, async ({ params, request }) => {
      await delay(options.delayMs ?? 0)
      const documentId = String(params['documentId'])
      const store = options.documentStore?.()
      const stored = store?.find((item) => item.documentId === documentId)
      const document = stored ?? (current.documentId === documentId ? current : undefined)
      if (document === undefined) {
        return notFound()
      }
      const body = (await request.json()) as WarehouseDocumentDraftRequest
      if (body.rowVersion !== document.rowVersion) {
        return toWireErrorResponse(versionConflictProblem(document), 409)
      }
      const updated = applyDraftToDocument(document, body, options.lookups)
      current = updated
      if (store !== undefined) {
        const index = store.findIndex((item) => item.documentId === documentId)
        if (index !== -1) {
          store[index] = updated
        }
      }
      options.onDocumentUpdated?.(updated)
      return okJson(updated)
    }),
  ]
}
