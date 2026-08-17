import { delay, http, HttpResponse, type HttpHandler } from 'msw'

import { environment } from '@/config/env'
import {
  actionRequiresReason,
  actionsForDocumentStatus,
  createLifecycleEvent,
  DOCUMENT_TRANSITIONS,
  fixtureUuid,
} from '@/test/msw/factories'
import type {
  DocumentActionType,
  DocumentActionResult,
  DocumentLifecycleEvent,
  DocumentPolicy,
  DocumentStatus,
  DocumentType,
  LifecycleActorSnapshot,
  LifecycleConflictProblemDetails,
  PageMeta,
  ProblemDetails,
  ReasonedDocumentActionRequest,
  VersionOnlyDocumentActionRequest,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'

/**
 * Scenario handler builders for the shared document engine.
 *
 * These functions return MSW handler arrays (registered via `server.use(...)`)
 * so document-engine tests — list filtering, detail, history, policy, and the
 * six lifecycle action POSTs — exercise the exact contract shapes the dev mock
 * API serves. The transition engine (`applyDocumentAction`) is the single
 * implementation shared with `src/mocks/handlers.ts`: same rowVersion guard,
 * same reason validation, same state-transition table, same 409 problem body.
 */

const DOCUMENT_PREFIX = `${environment.apiBaseUrl}/warehouse-documents`

const LIST_DEFAULT_PAGE_SIZE = 20

const DEFAULT_ACTOR: LifecycleActorSnapshot = {
  userId: fixtureUuid(10),
  displayName: 'مستخدم تجريبي',
  roleNameAr: 'أمين المستودع',
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
  pageIndex: number
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

function parseDocumentListQuery(url: URL): DocumentListQuery {
  const pageIndex = Number.parseInt(url.searchParams.get('pageIndex') ?? '0', 10)
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? String(LIST_DEFAULT_PAGE_SIZE),
    10,
  )
  const query: DocumentListQuery = {
    pageIndex: Number.isFinite(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
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

function pageMeta(totalItems: number, pageIndex: number, pageSize: number): PageMeta {
  return {
    pageIndex,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  }
}

function notFound(): HttpResponse<ProblemDetails> {
  const payload: ProblemDetails = {
    code: 'record.not_found',
    detailAr: 'لم يتم العثور على السجل المطلوب.',
    fieldErrors: [],
    status: 404,
    titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    traceId: 'mock-trace',
    type: 'https://eiams.example/problems/record.not_found',
  }
  return HttpResponse.json(payload, { status: 404 })
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

function versionConflictProblem(document: WarehouseDocument): LifecycleConflictProblemDetails {
  return {
    ...problemBase(
      'document.version_conflict',
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
      'document.action_not_allowed',
      `لا يمكن تنفيذ إجراء «${action}» في الحالة «${document.documentStatus}» الحالية للمستند.`,
      409,
    ),
    currentRowVersion: document.rowVersion,
    currentStatus: document.documentStatus,
    policy: document.policy,
  }
}

let eventIdSequence = 300

function nextEventId(): string {
  eventIdSequence += 1
  return fixtureUuid(eventIdSequence)
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
  | { kind: 'ok'; document: WarehouseDocument; result: DocumentActionResult }
  | { kind: 'validation'; problem: ProblemDetails }

/**
 * Applies one lifecycle action to a document snapshot without side effects:
 * the caller decides where the returned document/event are persisted. Guards,
 * in order: action is a real transition → reason present when required →
 * rowVersion matches (409) → current status matches the transition's `from`
 * (409). On success the rowVersion bumps by one, the policy is re-evaluated
 * for the new status, and a `DocumentActionResult` is produced.
 */
export function applyDocumentAction(input: DocumentActionInput): DocumentActionOutcome {
  const { action, document } = input
  const transition = DOCUMENT_TRANSITIONS[action]
  if (transition === undefined) {
    return {
      kind: 'validation',
      problem: problemBase(
        'document.action_unsupported',
        `لا يمكن تنفيذ إجراء «${action}» عبر مسار الحالة.`,
        422,
        'action',
      ),
    }
  }
  if (actionRequiresReason(action) && !isPresent(input.reason)) {
    return {
      kind: 'validation',
      problem: problemBase('document.reason_required', 'يرجى إدخال سبب الإجراء.', 422, 'reason'),
    }
  }
  if (input.rowVersion !== document.rowVersion) {
    return { kind: 'conflict', problem: versionConflictProblem(document) }
  }
  if (document.documentStatus !== transition.from) {
    return { kind: 'conflict', problem: actionNotAllowedProblem(document, action) }
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
      actions: actionsForDocumentStatus(transition.to),
      documentStatus: transition.to,
      evaluatedAt: occurredAt,
      rowVersion: nextRowVersion,
    },
  }
  const lifecycleEvent = createLifecycleEvent({
    correlationId: null,
    documentId: document.documentId,
    documentRowVersion: nextRowVersion,
    eventId: nextEventId(),
    eventType: transition.eventType,
    fromStatus: transition.from,
    occurredAt,
    occurredBy,
    reason: actionRequiresReason(action) ? (input.reason ?? null) : null,
    toStatus: transition.to,
  })
  return {
    kind: 'ok',
    document: updated,
    result: { document: updated, lifecycleEvent },
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
      const start = query.pageIndex * query.pageSize
      return HttpResponse.json({
        items: filtered.slice(start, start + query.pageSize),
        meta: pageMeta(filtered.length, query.pageIndex, query.pageSize),
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
      return params['documentId'] === document.documentId ? HttpResponse.json(document) : notFound()
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
      return HttpResponse.json({
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
      return params['documentId'] === policy.documentId ? HttpResponse.json(policy) : notFound()
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
  occurredBy?: LifecycleActorSnapshot
  delayMs?: number
}

/**
 * The six lifecycle action POSTs (submit/post/reject/revise/cancel/reverse)
 * wired to one mutable in-memory document record. Replays the same transition
 * engine the dev mock API uses, so engine tests and `pnpm dev` agree on
 * rowVersion (409), reason (422), and transition guards.
 */
export function createWarehouseDocumentActionHandler(
  options: DocumentActionHandlerOptions,
): readonly HttpHandler[] {
  let current = options.initialDocument
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
      const outcome = applyDocumentAction({
        action,
        document,
        rowVersion: body.rowVersion,
        reason: 'reason' in body ? (body.reason ?? null) : null,
        occurredBy: options.occurredBy,
      })
      if (outcome.kind === 'conflict') {
        return HttpResponse.json(outcome.problem, { status: 409 })
      }
      if (outcome.kind === 'validation') {
        return HttpResponse.json(outcome.problem, { status: 422 })
      }
      current = outcome.document
      if (store !== undefined) {
        const index = store.findIndex((item) => item.documentId === documentId)
        if (index !== -1) {
          store[index] = outcome.document
        }
      }
      options.onDocumentUpdated?.(outcome.document, action)
      return HttpResponse.json(outcome.result)
    }),
  )
}
