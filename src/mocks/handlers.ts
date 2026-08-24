import { delay, http, HttpResponse, type HttpHandler } from 'msw'

import { environment } from '@/config/env'
import { getDb, nextFixtureUuid } from '@/mocks/db'
import { createDevSession } from '@/shared/services/dev-session'
import { IDEMPOTENCY_KEY_HEADER } from '@/shared/services/mutation-safety'
import {
  createDocumentAttachment,
  createLifecycleEvent,
  createMaterialUnitConversion,
  createNamedReference,
  createPolicyBlocker,
  createWarehouseMaterialSetting,
  deriveLifecycleEvents,
} from '@/test/msw/factories'
import {
  applyDocumentAction,
  applyDraftToDocument,
  buildDraftDocument,
  createIdempotencyMemo,
  idempotencyMismatchProblem,
  WAREHOUSE_DOCUMENT_STATUSES,
  WAREHOUSE_DOCUMENT_TYPES,
} from '@/test/msw/warehouse-document-handlers'
import { readRequestForm } from '@/test/msw/multipart-parser'
import type {
  AttachmentType,
  DocumentActionType,
  DocumentType,
  EmployeeUpsertRequest,
  ExternalPartyUpsertRequest,
  LifecycleActorSnapshot,
  LifecycleConflictProblemDetails,
  InventoryBalance,
  InventoryBalanceSortField,
  InventoryLowStockState,
  Material,
  MaterialCategoryUpsertRequest,
  MaterialFamilyUpsertRequest,
  MaterialUnitConversionCreateRequest,
  MaterialUpsertRequest,
  NamedCodeUpsertRequest,
  OrganizationalUnitUpsertRequest,
  PageMeta,
  ProblemDetails,
  ReasonedDocumentActionRequest,
  SetActiveScopeRequest,
  SiteUpsertRequest,
  SortDirection,
  StockMovement,
  StockMovementSortField,
  StockMovementType,
  UnitOfMeasureUpsertRequest,
  VersionOnlyDocumentActionRequest,
  WarehouseCapabilityUpsertRequest,
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
  WarehouseMaterialSetting,
  WarehouseMaterialSettingUpsertRequest,
  WarehouseUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * Contract-derived handlers for the development mock API.
 *
 * These handlers mirror the OpenAPI snapshot (list shapes, query parameters,
 * record fields) so the UI runs end-to-end against `pnpm dev` without a real
 * backend. They are dev-only: the test suite keeps its own inline handlers and
 * never imports this module.
 */

const LIST_DEFAULT_PAGE_SIZE = 20
const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000071'

type ListParams = {
  pageIndex?: number
  pageSize?: number
  search?: string | undefined
  status?: string | undefined
  siteId?: string | undefined
  familyId?: string | undefined
  materialKind?: string | undefined
  domainId?: string | undefined
  categoryId?: string | undefined
  parentCategoryId?: string | undefined
  documentStatus?: string | undefined
  documentType?: string | undefined
  warehouseId?: string | undefined
  materialId?: string | undefined
  lowStockState?: string | undefined
  movementType?: string | undefined
  documentId?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  sortBy?: string | undefined
  sortDirection?: string | undefined
}

function toListParams(url: URL): ListParams {
  const pageIndex = Number.parseInt(url.searchParams.get('pageIndex') ?? '0', 10)
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? String(LIST_DEFAULT_PAGE_SIZE),
    10,
  )
  const params: ListParams = {
    pageIndex: Number.isFinite(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : LIST_DEFAULT_PAGE_SIZE,
  }
  for (const key of [
    'search',
    'status',
    'siteId',
    'familyId',
    'materialKind',
    'domainId',
    'categoryId',
    'parentCategoryId',
    'documentStatus',
    'documentType',
    'warehouseId',
    'materialId',
    'lowStockState',
    'movementType',
    'documentId',
    'dateFrom',
    'dateTo',
    'sortBy',
    'sortDirection',
  ] as const) {
    const value = url.searchParams.get(key)
    if (value !== null) {
      params[key] = value
    }
  }
  return params
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

function pagedResponse<Record>(records: readonly Record[], { pageIndex, pageSize }: ListParams) {
  const page = pageIndex ?? 0
  const size = pageSize ?? LIST_DEFAULT_PAGE_SIZE
  const start = page * size
  const items = records.slice(start, start + size)
  return HttpResponse.json({ items, meta: pageMeta(records.length, page, size) })
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

function attachmentDeleteForbiddenProblem(): ProblemDetails {
  return {
    ...problemBase(
      'document.attachment_delete_not_allowed',
      'لا يمكن حذف المرفقات إلا من مستند غير مُرصد بعد (مسودة).',
      403,
    ),
    titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
  }
}

function attachmentUploadForbiddenProblem(): ProblemDetails {
  return {
    ...problemBase(
      'signed_original_immutable',
      'لا يمكن رفع المرفقات بعد مغادرة المستند حالة المسودة.',
      403,
    ),
    titleAr: 'المرفقات للقراءة فقط في حالة المستند الحالية.',
  }
}

function attachmentValidationProblem(field: string, messageAr: string): ProblemDetails {
  return problemBase('document.attachment_invalid', messageAr, 422, field)
}

/** Structural file check that works across browser and Node multipart parsers. */
function isUploadedFile(value: unknown): value is { name: string; size: number; type: string } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record['name'] === 'string' &&
    typeof record['size'] === 'number' &&
    typeof record['type'] === 'string'
  )
}

/**
 * Re-evaluates the policy slice after an attachment mutation: toggles the
 * signed-original gate and keeps the policy rowVersion aligned with the doc.
 */
function reEvaluateAttachmentPolicy(
  document: WarehouseDocument,
  attachments: WarehouseDocument['attachments'],
  rowVersion: number,
): WarehouseDocument['policy'] {
  const signedOriginalSatisfied = attachments.some(
    (attachment) => attachment.attachmentType === 'SignedOriginal',
  )
  return {
    ...document.policy,
    blockers: signedOriginalSatisfied
      ? document.policy.blockers.filter(
          (blocker) => blocker.code !== 'document.signed_original_missing',
        )
      : document.policy.blockers.some(
            (blocker) => blocker.code === 'document.signed_original_missing',
          )
        ? document.policy.blockers
        : [
            ...document.policy.blockers,
            createPolicyBlocker({
              field: 'attachmentType',
              messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
            }),
          ],
    rowVersion,
    signedOriginalSatisfied,
  }
}

const CATALOG_PREFIX = `${environment.apiBaseUrl}/catalog`
const AUTH_PREFIX = environment.apiBaseUrl
const DOCUMENT_PREFIX = `${environment.apiBaseUrl}/warehouse-documents`

const DOCUMENT_ACTION_IDEMPOTENCY = createIdempotencyMemo()

function documentActor(): LifecycleActorSnapshot {
  const session = createDevSession().session
  return {
    userId: session.user.userId,
    displayName: session.user.displayName,
    roleNameAr: session.activeRoles[0]?.nameAr ?? null,
  }
}

const DOCUMENT_REFERENCE_PREFIX: Readonly<Record<DocumentType, string>> = {
  Adjustment: 'ADJ',
  Issue: 'ISS',
  Opening: 'OPN',
  Receiving: 'RCV',
  Return: 'RTN',
  Transfer: 'TRF',
}

function nextSystemReferenceNumber(documentType: DocumentType, year: number): string {
  const db = getDb()
  const sequence =
    db.warehouseDocuments.filter(
      (document) => document.documentType === documentType && document.paperDocumentYear === year,
    ).length + 1
  return `EIAMS-${DOCUMENT_REFERENCE_PREFIX[documentType]}-${year}-${String(sequence).padStart(4, '0')}`
}

function draftLookups() {
  const db = getDb()
  return {
    materialOf: (materialId: string) =>
      db.materials.find((material) => material.materialId === materialId),
    unitOf: (unitId: string | undefined) => {
      if (unitId === undefined) {
        return undefined
      }
      const conversion = db.unitConversions.find((item) => item.conversionId === unitId)
      return conversion?.fromUnit ?? createNamedReference({ id: unitId })
    },
    warehouseOf: (warehouseId: string) =>
      db.warehouses.find((warehouse) => warehouse.warehouseId === warehouseId),
  }
}

/**
 * Shared lifecycle-action route body for the six POST action endpoints. Locates
 * the document, replays `applyDocumentAction` (rowVersion guard → 409 with the
 * LifecycleConflict body, reason validation → 422, status transition table),
 * persists the returned document and appends its lifecycle event so the
 * history endpoint keeps reflecting reality. A Reverse also persists the
 * compensating document returned by the engine (with its Created/Submitted/
 * Posted chain) so it is listable and detailable like any other document.
 */
async function documentActionRoute(
  action: DocumentActionType,
  documentId: unknown,
  request: Request,
) {
  const db = getDb()
  const index = db.warehouseDocuments.findIndex((item) => item.documentId === documentId)
  if (index === -1) {
    return notFound()
  }
  const document = db.warehouseDocuments[index]!
  const body = (await request.json()) as
    VersionOnlyDocumentActionRequest | ReasonedDocumentActionRequest
  const reason = 'reason' in body ? (body.reason ?? null) : null
  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  const memoCheck = DOCUMENT_ACTION_IDEMPOTENCY.check({
    idempotencyKey,
    action,
    documentId: document.documentId,
    rowVersion: body.rowVersion,
    reason,
  })
  if (memoCheck.kind === 'replay') {
    return HttpResponse.json(memoCheck.result)
  }
  if (memoCheck.kind === 'mismatch') {
    return HttpResponse.json(idempotencyMismatchProblem(), { status: 422 })
  }
  const outcome = applyDocumentAction({
    action,
    document,
    rowVersion: body.rowVersion,
    reason,
    occurredBy: documentActor(),
  })
  if (outcome.kind === 'conflict') {
    return HttpResponse.json(outcome.problem, { status: 409 })
  }
  if (outcome.kind === 'validation') {
    return HttpResponse.json(outcome.problem, { status: 422 })
  }
  if (idempotencyKey !== null) {
    DOCUMENT_ACTION_IDEMPOTENCY.store(
      idempotencyKey,
      action,
      document.documentId,
      body.rowVersion,
      reason,
      outcome.result,
    )
  }
  db.warehouseDocuments[index] = outcome.document
  const events = db.documentLifecycleEvents[document.documentId] ?? []
  events.push(outcome.result.lifecycleEvent)
  db.documentLifecycleEvents[document.documentId] = events
  if (outcome.compensatingDocument !== undefined) {
    db.warehouseDocuments.push(outcome.compensatingDocument)
    db.documentLifecycleEvents[outcome.compensatingDocument.documentId] = deriveLifecycleEvents(
      outcome.compensatingDocument,
    )
  }
  return HttpResponse.json(outcome.result)
}

function documentListMatches(
  document: {
    documentStatus: string
    documentType: string
    paperDocumentNumber: string
    systemReferenceNumber: string
    warehouse: { id: string }
  },
  params: ListParams,
): boolean {
  return (
    (params.documentStatus === undefined || document.documentStatus === params.documentStatus) &&
    (params.documentType === undefined || document.documentType === params.documentType) &&
    (params.warehouseId === undefined || document.warehouse.id === params.warehouseId) &&
    matchesSearch(
      document,
      params.search,
      (item) => `${item.paperDocumentNumber} ${item.systemReferenceNumber}`,
    )
  )
}

function includedIn<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined
  }
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

const ARABIC_COLLATOR = new Intl.Collator('ar-SY', { sensitivity: 'base', usage: 'sort' })
const INVENTORY_PREFIX = `${environment.apiBaseUrl}/inventory`
const BALANCE_SORT_FIELDS = [
  'WarehouseDisplayName',
  'MaterialDisplayName',
  'Quantity',
  'LastUpdated',
] as const satisfies readonly InventoryBalanceSortField[]
const MOVEMENT_SORT_FIELDS = [
  'PostedAt',
  'WarehouseDisplayName',
  'MaterialDisplayName',
  'MovementType',
  'QuantityDelta',
] as const satisfies readonly StockMovementSortField[]
const LOW_STOCK_STATES = [
  'Low',
  'Sufficient',
  'NotConfigured',
  'Disabled',
] as const satisfies readonly InventoryLowStockState[]
const MOVEMENT_TYPES = [
  'Receipt',
  'Issue',
  'TransferIn',
  'TransferOut',
  'AdjustmentIn',
  'AdjustmentOut',
  'Opening',
] as const satisfies readonly StockMovementType[]

function isOneOf<T extends string>(value: string | undefined, values: readonly T[]): value is T {
  return value !== undefined && (values as readonly string[]).includes(value)
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return value === 'Ascending' || value === 'Descending'
}

function inventoryQueryProblem(parameter: string): HttpResponse<ProblemDetails> {
  return HttpResponse.json(
    problemBase(
      'inventory.invalid_query',
      `قيمة عامل التصفية أو الترتيب «${parameter}» غير صالحة.`,
      400,
    ),
    { status: 400 },
  )
}

function compareText(left: string, right: string): number {
  return ARABIC_COLLATOR.compare(left, right)
}

function compareUuid(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareNumber(left: number, right: number): number {
  return left - right
}

function withDirection(result: number, direction: SortDirection): number {
  return direction === 'Ascending' ? result : -result
}

function balanceFieldComparison(
  left: InventoryBalance,
  right: InventoryBalance,
  field: InventoryBalanceSortField,
): number {
  switch (field) {
    case 'WarehouseDisplayName':
      return compareText(left.warehouse.displayName, right.warehouse.displayName)
    case 'MaterialDisplayName':
      return compareText(left.material.displayName, right.material.displayName)
    case 'Quantity':
      return compareNumber(left.quantity, right.quantity)
    case 'LastUpdated':
      return compareText(left.lastUpdated, right.lastUpdated)
  }
}

function movementFieldComparison(
  left: StockMovement,
  right: StockMovement,
  field: StockMovementSortField,
): number {
  switch (field) {
    case 'PostedAt':
      return compareText(left.postedAt, right.postedAt)
    case 'WarehouseDisplayName':
      return compareText(left.warehouse.displayName, right.warehouse.displayName)
    case 'MaterialDisplayName':
      return compareText(left.material.displayName, right.material.displayName)
    case 'MovementType':
      return compareText(left.movementType, right.movementType)
    case 'QuantityDelta':
      return compareNumber(left.quantityDelta, right.quantityDelta)
  }
}

/**
 * Dev-only ordering mirrors D-INV-READ-01 so Browser QA exercises a complete
 * read surface. It remains fixture ordering, not evidence of backend sorting.
 */
function sortBalances(
  balances: readonly InventoryBalance[],
  sortBy: InventoryBalanceSortField,
  sortDirection: SortDirection,
): InventoryBalance[] {
  const fields = [
    sortBy,
    ...(['WarehouseDisplayName', 'MaterialDisplayName'] as const).filter(
      (field) => field !== sortBy,
    ),
  ]
  return [...balances].sort((left, right) => {
    for (const field of fields) {
      const comparison = balanceFieldComparison(left, right, field)
      if (comparison !== 0) {
        return withDirection(comparison, field === sortBy ? sortDirection : 'Ascending')
      }
    }
    return compareUuid(left.balanceId, right.balanceId)
  })
}

function sortMovements(
  movements: readonly StockMovement[],
  sortBy: StockMovementSortField,
  sortDirection: SortDirection,
): StockMovement[] {
  const secondaryFields = MOVEMENT_SORT_FIELDS.filter(
    (field) => field === 'PostedAt' && field !== sortBy,
  )
  return [...movements].sort((left, right) => {
    const primary = movementFieldComparison(left, right, sortBy)
    if (primary !== 0) {
      return withDirection(primary, sortDirection)
    }
    for (const field of secondaryFields) {
      const comparison = movementFieldComparison(left, right, field)
      if (comparison !== 0) {
        return withDirection(comparison, 'Descending')
      }
    }
    return withDirection(
      compareUuid(left.movementId, right.movementId),
      sortBy === 'PostedAt' ? sortDirection : 'Descending',
    )
  })
}

export const mockApiHandlers: readonly HttpHandler[] = [
  // --- Catalog: domains -----------------------------------------------------
  http.get(`${CATALOG_PREFIX}/domains`, async ({ request }) => {
    await delay(120)
    const { status } = toListParams(new URL(request.url))
    const domains = getDb().domains.filter(
      (domain) => status === undefined || domain.status === status,
    )
    return HttpResponse.json(domains)
  }),
  http.get(`${CATALOG_PREFIX}/domains/:domainId`, async ({ params }) => {
    const domain = getDb().domains.find((item) => item.domainId === params['domainId'])
    return domain === undefined ? notFound() : HttpResponse.json(domain)
  }),
  http.post(`${CATALOG_PREFIX}/domains`, async ({ request }) => {
    const body = (await request.json()) as NamedCodeUpsertRequest
    const domain = {
      domainId: nextFixtureUuid(),
      code: body.code,
      nameAr: body.nameAr,
      rowVersion: 1,
      status: body.status,
    }
    getDb().domains.push(domain)
    return HttpResponse.json(domain, { status: 201 })
  }),
  http.put(`${CATALOG_PREFIX}/domains/:domainId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.domains.find((item) => item.domainId === params['domainId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as NamedCodeUpsertRequest
    const updated = {
      ...previous,
      code: body.code,
      nameAr: body.nameAr,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.domains[db.domains.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Catalog: categories --------------------------------------------------
  http.get(`${CATALOG_PREFIX}/categories`, async ({ request }) => {
    await delay(120)
    const { domainId, parentCategoryId } = toListParams(new URL(request.url))
    const categories = getDb().categories.filter(
      (category) =>
        (domainId === undefined || category.domain.id === domainId) &&
        (parentCategoryId === undefined ||
          (category.parentCategoryId === undefined
            ? parentCategoryId === 'root'
            : category.parentCategoryId === parentCategoryId)),
    )
    return HttpResponse.json(categories)
  }),
  http.get(`${CATALOG_PREFIX}/categories/:categoryId`, async ({ params }) => {
    const category = getDb().categories.find((item) => item.categoryId === params['categoryId'])
    return category === undefined ? notFound() : HttpResponse.json(category)
  }),
  http.post(`${CATALOG_PREFIX}/categories`, async ({ request }) => {
    const body = (await request.json()) as MaterialCategoryUpsertRequest
    const domain = getDb().domains.find((item) => item.domainId === body.domainId)
    const category = {
      categoryId: nextFixtureUuid(),
      code: body.code,
      domain: { id: body.domainId, displayName: domain?.nameAr ?? body.nameAr },
      nameAr: body.nameAr,
      pathDisplay: `${domain?.nameAr ?? ''} / ${body.nameAr}`,
      rowVersion: 1,
      status: body.status,
      ...(body.parentCategoryId === undefined ? {} : { parentCategoryId: body.parentCategoryId }),
    }
    getDb().categories.push(category)
    return HttpResponse.json(category, { status: 201 })
  }),
  http.put(`${CATALOG_PREFIX}/categories/:categoryId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.categories.find((item) => item.categoryId === params['categoryId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as MaterialCategoryUpsertRequest
    const domain = db.domains.find((item) => item.domainId === body.domainId)
    const updated = {
      ...previous,
      code: body.code,
      domain: { id: body.domainId, displayName: domain?.nameAr ?? previous.domain.displayName },
      nameAr: body.nameAr,
      pathDisplay: `${domain?.nameAr ?? ''} / ${body.nameAr}`,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
      ...(body.parentCategoryId === undefined ? {} : { parentCategoryId: body.parentCategoryId }),
    }
    db.categories[db.categories.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Catalog: families ----------------------------------------------------
  http.get(`${CATALOG_PREFIX}/families`, async ({ request }) => {
    await delay(120)
    const { categoryId, search } = toListParams(new URL(request.url))
    const families = getDb().families.filter(
      (family) =>
        (categoryId === undefined || family.category.id === categoryId) &&
        matchesSearch(family, search, (item) => `${item.nameAr} ${item.code}`),
    )
    return HttpResponse.json(families)
  }),
  http.get(`${CATALOG_PREFIX}/families/:familyId`, async ({ params }) => {
    const family = getDb().families.find((item) => item.familyId === params['familyId'])
    return family === undefined ? notFound() : HttpResponse.json(family)
  }),
  http.post(`${CATALOG_PREFIX}/families`, async ({ request }) => {
    const body = (await request.json()) as MaterialFamilyUpsertRequest
    const category = getDb().categories.find((item) => item.categoryId === body.categoryId)
    const domain = getDb().domains.find((item) => item.domainId === category?.domain.id)
    const family = {
      familyId: nextFixtureUuid(),
      code: body.code,
      domain: {
        id: domain?.domainId ?? category?.domain.id ?? '',
        displayName: domain?.nameAr ?? '',
      },
      category: { id: body.categoryId, displayName: category?.nameAr ?? '' },
      nameAr: body.nameAr,
      rowVersion: 1,
      status: body.status,
    }
    getDb().families.push(family)
    return HttpResponse.json(family, { status: 201 })
  }),
  http.put(`${CATALOG_PREFIX}/families/:familyId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.families.find((item) => item.familyId === params['familyId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as MaterialFamilyUpsertRequest
    const category = db.categories.find((item) => item.categoryId === body.categoryId)
    const domain = db.domains.find((item) => item.domainId === category?.domain.id)
    const updated = {
      ...previous,
      code: body.code,
      domain: { id: domain?.domainId ?? '', displayName: domain?.nameAr ?? '' },
      category: { id: body.categoryId, displayName: category?.nameAr ?? '' },
      nameAr: body.nameAr,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.families[db.families.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Catalog: materials ---------------------------------------------------
  http.get(`${CATALOG_PREFIX}/materials`, async ({ request }) => {
    await delay(150)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().materials.filter(
      (material) =>
        (params.familyId === undefined || material.family.id === params.familyId) &&
        (params.materialKind === undefined || material.materialKind === params.materialKind) &&
        (params.status === undefined || material.status === params.status) &&
        matchesSearch(material, params.search, (item) => `${item.nameAr} ${item.code}`),
    )
    return pagedResponse(filtered, params)
  }),
  http.get(`${CATALOG_PREFIX}/materials/:materialId`, async ({ params }) => {
    const material = getDb().materials.find((item) => item.materialId === params['materialId'])
    return material === undefined ? notFound() : HttpResponse.json(material)
  }),
  http.post(`${CATALOG_PREFIX}/materials`, async ({ request }) => {
    const body = (await request.json()) as MaterialUpsertRequest
    const family = getDb().families.find((item) => item.familyId === body.familyId)
    const unit = getDb().units.find((item) => item.unitId === body.baseUnitId)
    if (family === undefined || unit === undefined) {
      return notFound()
    }
    const material = {
      materialId: nextFixtureUuid(),
      code: body.code,
      nameAr: body.nameAr,
      descriptionAr: body.descriptionAr ?? null,
      domain: family.domain,
      category: family.category,
      family: { id: family.familyId, displayName: family.nameAr },
      baseUnit: { id: unit.unitId, displayName: unit.nameAr, code: unit.code },
      materialKind: body.materialKind,
      requiresAssetNumber: body.requiresAssetNumber,
      trackingType: body.trackingType,
      rowVersion: 1,
      status: body.status,
    } as Material
    getDb().materials.push(material)
    return HttpResponse.json(material, { status: 201 })
  }),
  http.put(`${CATALOG_PREFIX}/materials/:materialId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.materials.find((item) => item.materialId === params['materialId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as MaterialUpsertRequest
    const updated = {
      materialId: previous.materialId,
      code: body.code,
      nameAr: body.nameAr,
      descriptionAr: body.descriptionAr ?? null,
      domain: previous.domain,
      category: previous.category,
      family: previous.family,
      baseUnit: previous.baseUnit,
      materialKind: body.materialKind,
      requiresAssetNumber: body.requiresAssetNumber,
      trackingType: body.trackingType,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    } as Material
    db.materials[db.materials.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Catalog: units of measure --------------------------------------------
  http.get(`${CATALOG_PREFIX}/units-of-measure`, async () => {
    await delay(100)
    return HttpResponse.json(getDb().units)
  }),
  http.get(`${CATALOG_PREFIX}/units-of-measure/:unitId`, async ({ params }) => {
    const unit = getDb().units.find((item) => item.unitId === params['unitId'])
    return unit === undefined ? notFound() : HttpResponse.json(unit)
  }),
  http.post(`${CATALOG_PREFIX}/units-of-measure`, async ({ request }) => {
    const body = (await request.json()) as UnitOfMeasureUpsertRequest
    const unit = {
      unitId: nextFixtureUuid(),
      code: body.code,
      nameAr: body.nameAr,
      symbolAr: body.symbolAr,
      rowVersion: 1,
      status: body.status,
    }
    getDb().units.push(unit)
    return HttpResponse.json(unit, { status: 201 })
  }),
  http.put(`${CATALOG_PREFIX}/units-of-measure/:unitId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.units.find((item) => item.unitId === params['unitId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as UnitOfMeasureUpsertRequest
    const updated = {
      ...previous,
      code: body.code,
      nameAr: body.nameAr,
      symbolAr: body.symbolAr,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.units[db.units.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Catalog: material unit conversions -----------------------------------
  http.get(`${CATALOG_PREFIX}/materials/:materialId/unit-conversions`, async ({ params }) => {
    const conversions = getDb().unitConversions.filter(
      (item) => item.material.id === params['materialId'],
    )
    return HttpResponse.json(conversions)
  }),
  http.post(
    `${CATALOG_PREFIX}/materials/:materialId/unit-conversions`,
    async ({ params, request }) => {
      const body = (await request.json()) as MaterialUnitConversionCreateRequest
      const material = getDb().materials.find((item) => item.materialId === params['materialId'])
      const fromUnit = getDb().units.find((item) => item.unitId === body.fromUnitId)
      if (material === undefined || fromUnit === undefined) {
        return notFound()
      }
      const conversion = createMaterialUnitConversion({
        conversionId: nextFixtureUuid(),
        material: { id: material.materialId, displayName: material.nameAr },
        fromUnit: { id: fromUnit.unitId, displayName: fromUnit.nameAr, code: fromUnit.code },
        baseUnit: material.baseUnit,
        factor: body.factor,
        rowVersion: 1,
        status: 'Active',
        usedInPostedDocuments: false,
      })
      getDb().unitConversions.push(conversion)
      return HttpResponse.json(conversion, { status: 201 })
    },
  ),

  // --- Organization: sites --------------------------------------------------
  http.get(`${AUTH_PREFIX}/sites`, async ({ request }) => {
    await delay(120)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().sites.filter(
      (site) =>
        (params.status === undefined || site.status === params.status) &&
        matchesSearch(
          site,
          params.search,
          (item) => `${item.nameAr} ${item.code} ${item.governorate ?? ''}`,
        ),
    )
    return pagedResponse(filtered, params)
  }),
  http.get(`${AUTH_PREFIX}/sites/:siteId`, async ({ params }) => {
    const site = getDb().sites.find((item) => item.siteId === params['siteId'])
    return site === undefined ? notFound() : HttpResponse.json(site)
  }),
  http.post(`${AUTH_PREFIX}/sites`, async ({ request }) => {
    const body = (await request.json()) as SiteUpsertRequest
    const site = {
      siteId: nextFixtureUuid(),
      organizationId: body.organizationId ?? DEFAULT_ORGANIZATION_ID,
      code: body.code,
      nameAr: body.nameAr,
      address: body.address ?? null,
      governorate: body.governorate ?? null,
      rowVersion: 1,
      status: body.status,
    }
    getDb().sites.push(site)
    return HttpResponse.json(site, { status: 201 })
  }),
  http.put(`${AUTH_PREFIX}/sites/:siteId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.sites.find((item) => item.siteId === params['siteId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as SiteUpsertRequest
    const updated = {
      ...previous,
      code: body.code,
      nameAr: body.nameAr,
      address: body.address ?? null,
      governorate: body.governorate ?? null,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.sites[db.sites.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Organization: organizational units -----------------------------------
  http.get(`${AUTH_PREFIX}/organizational-units`, async ({ request }) => {
    await delay(120)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().organizationalUnits.filter(
      (unit) =>
        (params.siteId === undefined || unit.siteId === params.siteId) &&
        matchesSearch(unit, params.search, (item) => `${item.nameAr} ${item.code}`),
    )
    return pagedResponse(filtered, params)
  }),
  http.get(`${AUTH_PREFIX}/organizational-units/:orgUnitId`, async ({ params }) => {
    const unit = getDb().organizationalUnits.find((item) => item.orgUnitId === params['orgUnitId'])
    return unit === undefined ? notFound() : HttpResponse.json(unit)
  }),
  http.post(`${AUTH_PREFIX}/organizational-units`, async ({ request }) => {
    const body = (await request.json()) as OrganizationalUnitUpsertRequest
    const site = getDb().sites.find((item) => item.siteId === body.siteId)
    const unit = {
      orgUnitId: nextFixtureUuid(),
      siteId: body.siteId,
      code: body.code,
      nameAr: body.nameAr,
      pathDisplay: `${site?.nameAr ?? ''} / ${body.nameAr}`,
      rowVersion: 1,
      status: body.status,
      ...(body.parentOrgUnitId === undefined ? {} : { parentOrgUnitId: body.parentOrgUnitId }),
    }
    getDb().organizationalUnits.push(unit)
    return HttpResponse.json(unit, { status: 201 })
  }),
  http.put(`${AUTH_PREFIX}/organizational-units/:orgUnitId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.organizationalUnits.find((item) => item.orgUnitId === params['orgUnitId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as OrganizationalUnitUpsertRequest
    const updated = {
      ...previous,
      code: body.code,
      nameAr: body.nameAr,
      pathDisplay: `${db.sites.find((item) => item.siteId === body.siteId)?.nameAr ?? ''} / ${body.nameAr}`,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
      ...(body.parentOrgUnitId === undefined ? {} : { parentOrgUnitId: body.parentOrgUnitId }),
    }
    db.organizationalUnits[db.organizationalUnits.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Organization: employees ----------------------------------------------
  http.get(`${AUTH_PREFIX}/employees`, async ({ request }) => {
    await delay(150)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().employees.filter(
      (employee) =>
        (params.siteId === undefined || employee.site.id === params.siteId) &&
        (params.status === undefined || employee.status === params.status) &&
        matchesSearch(
          employee,
          params.search,
          (item) => `${item.fullNameAr} ${item.employeeNumber} ${item.jobTitleAr ?? ''}`,
        ),
    )
    return pagedResponse(filtered, params)
  }),
  http.get(`${AUTH_PREFIX}/employees/:employeeId`, async ({ params }) => {
    const employee = getDb().employees.find((item) => item.employeeId === params['employeeId'])
    return employee === undefined ? notFound() : HttpResponse.json(employee)
  }),
  http.post(`${AUTH_PREFIX}/employees`, async ({ request }) => {
    const body = (await request.json()) as EmployeeUpsertRequest
    const orgUnit = getDb().organizationalUnits.find((item) => item.orgUnitId === body.orgUnitId)
    const site = getDb().sites.find((item) => item.siteId === orgUnit?.siteId)
    const employee = {
      employeeId: nextFixtureUuid(),
      employeeNumber: body.employeeNumber,
      fullNameAr: body.fullNameAr,
      jobTitleAr: body.jobTitleAr ?? null,
      orgUnit: { id: body.orgUnitId, displayName: orgUnit?.nameAr ?? '' },
      site: { id: site?.siteId ?? '', displayName: site?.nameAr ?? '' },
      rowVersion: 1,
      status: body.status,
    }
    getDb().employees.push(employee)
    return HttpResponse.json(employee, { status: 201 })
  }),
  http.put(`${AUTH_PREFIX}/employees/:employeeId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.employees.find((item) => item.employeeId === params['employeeId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as EmployeeUpsertRequest
    const orgUnit = db.organizationalUnits.find((item) => item.orgUnitId === body.orgUnitId)
    const site = db.sites.find((item) => item.siteId === orgUnit?.siteId)
    const updated = {
      ...previous,
      employeeNumber: body.employeeNumber,
      fullNameAr: body.fullNameAr,
      jobTitleAr: body.jobTitleAr ?? null,
      orgUnit: { id: body.orgUnitId, displayName: orgUnit?.nameAr ?? '' },
      site: { id: site?.siteId ?? '', displayName: site?.nameAr ?? '' },
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.employees[db.employees.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Organization: external parties ---------------------------------------
  http.get(`${AUTH_PREFIX}/external-parties`, async ({ request }) => {
    await delay(150)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().externalParties.filter(
      (party) =>
        (params.status === undefined || party.status === params.status) &&
        matchesSearch(party, params.search, (item) => `${item.nameAr} ${item.code ?? ''}`),
    )
    return pagedResponse(filtered, params)
  }),

  // --- Organization: polymorphic counterpart lookups (D-POST-01) ------------
  // Active, scope-aware options for Issue/Custody recipient and holder
  // choices. Derived from the fixture graph: employees, organizational units,
  // sites, and external parties are all active counterparts.
  http.get(`${AUTH_PREFIX}/counterparts`, async ({ request }) => {
    await delay(120)
    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const search = (url.searchParams.get('search') ?? '').trim()
    const db = getDb()
    const pool: Array<{
      id: string
      displayName: string
      secondaryLabelAr: string | null
      type: 'Employee' | 'OrganizationalUnit' | 'Site' | 'External'
    }> = [
      ...db.employees.map((employee) => ({
        id: employee.employeeId,
        displayName: employee.fullNameAr,
        secondaryLabelAr: employee.jobTitleAr ?? null,
        type: 'Employee' as const,
      })),
      ...db.organizationalUnits.map((unit) => ({
        id: unit.orgUnitId,
        displayName: unit.nameAr,
        secondaryLabelAr: unit.code,
        type: 'OrganizationalUnit' as const,
      })),
      ...db.sites.map((site) => ({
        id: site.siteId,
        displayName: site.nameAr,
        secondaryLabelAr: site.code,
        type: 'Site' as const,
      })),
      ...db.externalParties.map((party) => ({
        id: party.externalPartyId,
        displayName: party.nameAr,
        secondaryLabelAr: party.code ?? null,
        type: 'External' as const,
      })),
    ]
    const filtered = pool.filter(
      (counterpart) =>
        (type === null || counterpart.type === type) &&
        (search === '' || counterpart.displayName.includes(search)),
    )
    return HttpResponse.json({
      items: filtered.map((counterpart) => ({
        displayName: counterpart.displayName,
        id: counterpart.id,
        secondaryLabelAr: counterpart.secondaryLabelAr,
        status: 'Active' as const,
        type: counterpart.type,
      })),
      meta: { page: 0, pageSize: 10, total: filtered.length },
    })
  }),

  // --- Asset registry: issued-asset selector source (D-IAR-01 / e16-t05) ----
  // Filters mirror the contract's listAssets operation: materialId,
  // warehouseId (single id), derivedStatus, and free-text search over the
  // asset number + serial + material name.
  http.get(`${AUTH_PREFIX}/assets`, async ({ request }) => {
    await delay(120)
    const url = new URL(request.url)
    const materialId = url.searchParams.get('materialId')
    const warehouseId = url.searchParams.get('warehouseId')
    const status = url.searchParams.get('status')
    const search = (url.searchParams.get('search') ?? '').trim()
    const pageIndex = Number(url.searchParams.get('pageIndex') ?? '0') || 0
    const pageSize = Number(url.searchParams.get('pageSize') ?? '50') || 50
    const filtered = getDb().assets.filter(
      (asset) =>
        (materialId === null || asset.material.id === materialId) &&
        (warehouseId === null || asset.currentWarehouse?.id === warehouseId) &&
        (status === null || asset.derivedStatus === status) &&
        (search === '' ||
          `${asset.assetNumber} ${asset.serialNumber ?? ''} ${asset.material.displayName}`.includes(
            search,
          )),
    )
    const pageItems = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
    return HttpResponse.json({
      items: pageItems,
      meta: { page: pageIndex, pageSize, total: filtered.length },
    })
  }),
  // --- Asset detail reads (D-AST-02 / e18-t03..t05) -------------------------
  http.get(`${AUTH_PREFIX}/assets/:assetId`, async ({ params }) => {
    await delay(100)
    const asset = getDb().assets.find((item) => item.assetId === params['assetId'])
    return asset === undefined ? notFound() : HttpResponse.json(asset)
  }),
  http.get(`${AUTH_PREFIX}/assets/:assetId/custody`, async ({ params }) => {
    await delay(100)
    const asset = getDb().assets.find((item) => item.assetId === params['assetId'])
    if (asset === undefined) {
      return notFound()
    }
    // Only assets that have been issued/custodied carry timeline entries; the
    // C099 fixture models one operational custody row at the branch site.
    if (asset.derivedStatus === 'Issued') {
      return HttpResponse.json([
        {
          assetId: asset.assetId,
          assetNumber: asset.assetNumber,
          custodyId: nextFixtureUuid(),
          custodyKind: 'Operational',
          fromTs: '2026-08-01T08:00:00.000Z',
          holder: {
            displayName: 'مديرية النقل والحراسة',
            id: nextFixtureUuid(),
            secondaryLabelAr: null,
            status: 'Active' as const,
            type: 'OrganizationalUnit' as const,
          },
          issueDocumentId: nextFixtureUuid(),
          rowVersion: 1,
          status: 'Active',
        },
      ])
    }
    return HttpResponse.json([])
  }),
  http.get(`${AUTH_PREFIX}/assets/:assetId/movements`, async ({ params }) => {
    await delay(100)
    const asset = getDb().assets.find((item) => item.assetId === params['assetId'])
    if (asset === undefined) {
      return notFound()
    }
    const items =
      asset.derivedStatus === 'Issued'
        ? [
            {
              assetId: asset.assetId,
              documentId: nextFixtureUuid(),
              documentLineId: nextFixtureUuid(),
              documentReference: 'EIAMS-ISS-2025-0007',
              eventType: 'Received' as const,
              movementId: nextFixtureUuid(),
              occurredAt: '2024-06-15T09:00:00.000Z',
              occurredBy: { displayName: 'مريم الحلبي', id: nextFixtureUuid() },
              toWarehouse: {
                displayName: 'المستودع المركزي',
                id: nextFixtureUuid(),
              },
            },
            {
              assetId: asset.assetId,
              custodyId: nextFixtureUuid(),
              documentId: nextFixtureUuid(),
              documentLineId: nextFixtureUuid(),
              documentReference: 'EIAMS-ISS-2026-0012',
              eventType: 'Issued' as const,
              fromWarehouse: {
                displayName: 'المستودع المركزي',
                id: nextFixtureUuid(),
              },
              movementId: nextFixtureUuid(),
              occurredAt: '2026-08-01T10:00:00.000Z',
              occurredBy: { displayName: 'مدير النظام', id: nextFixtureUuid() },
              toWarehouse: {
                displayName: 'مستودع الفرع الشمالي',
                id: nextFixtureUuid(),
              },
            },
          ]
        : []
    return HttpResponse.json({
      items,
      meta: {
        pageIndex: 0,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    })
  }),
  http.get(`${AUTH_PREFIX}/external-parties/:externalPartyId`, async ({ params }) => {
    const party = getDb().externalParties.find(
      (item) => item.externalPartyId === params['externalPartyId'],
    )
    return party === undefined ? notFound() : HttpResponse.json(party)
  }),
  http.post(`${AUTH_PREFIX}/external-parties`, async ({ request }) => {
    const body = (await request.json()) as ExternalPartyUpsertRequest
    const party = {
      externalPartyId: nextFixtureUuid(),
      code: body.code ?? null,
      nameAr: body.nameAr,
      contactInfo: body.contactInfo ?? null,
      notes: body.notes ?? null,
      rowVersion: 1,
      status: body.status,
    }
    getDb().externalParties.push(party)
    return HttpResponse.json(party, { status: 201 })
  }),
  http.put(`${AUTH_PREFIX}/external-parties/:externalPartyId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.externalParties.find(
      (item) => item.externalPartyId === params['externalPartyId'],
    )
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as ExternalPartyUpsertRequest
    const updated = {
      externalPartyId: previous.externalPartyId,
      code: body.code ?? null,
      nameAr: body.nameAr,
      contactInfo: body.contactInfo ?? null,
      notes: body.notes ?? null,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.externalParties[db.externalParties.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),
  http.post(`${AUTH_PREFIX}/external-parties/:externalPartyId/deactivate`, async ({ params }) => {
    const db = getDb()
    const previous = db.externalParties.find(
      (item) => item.externalPartyId === params['externalPartyId'],
    )
    if (previous === undefined) {
      return notFound()
    }
    const updated = {
      externalPartyId: previous.externalPartyId,
      code: previous.code ?? null,
      nameAr: previous.nameAr,
      contactInfo: previous.contactInfo ?? null,
      notes: previous.notes ?? null,
      rowVersion: previous.rowVersion + 1,
      status: 'Inactive' as const,
    }
    db.externalParties[db.externalParties.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),

  // --- Warehouse ------------------------------------------------------------
  http.get(`${AUTH_PREFIX}/warehouses`, async ({ request }) => {
    await delay(150)
    const params = toListParams(new URL(request.url))
    const filtered = getDb().warehouses.filter(
      (warehouse) =>
        (params.siteId === undefined || warehouse.site.id === params.siteId) &&
        (params.status === undefined || warehouse.status === params.status) &&
        matchesSearch(warehouse, params.search, (item) => `${item.nameAr} ${item.code}`),
    )
    return pagedResponse(filtered, params)
  }),
  http.get(`${AUTH_PREFIX}/warehouses/:warehouseId`, async ({ params }) => {
    const warehouse = getDb().warehouses.find((item) => item.warehouseId === params['warehouseId'])
    return warehouse === undefined ? notFound() : HttpResponse.json(warehouse)
  }),
  http.post(`${AUTH_PREFIX}/warehouses`, async ({ request }) => {
    const body = (await request.json()) as WarehouseUpsertRequest
    const site = getDb().sites.find((item) => item.siteId === body.siteId)
    const warehouse = {
      warehouseId: nextFixtureUuid(),
      code: body.code,
      nameAr: body.nameAr,
      locationAr: body.locationAr ?? null,
      site: { id: body.siteId, displayName: site?.nameAr ?? '' },
      rowVersion: 1,
      status: body.status,
    }
    getDb().warehouses.push(warehouse)
    return HttpResponse.json(warehouse, { status: 201 })
  }),
  http.put(`${AUTH_PREFIX}/warehouses/:warehouseId`, async ({ params, request }) => {
    const db = getDb()
    const previous = db.warehouses.find((item) => item.warehouseId === params['warehouseId'])
    if (previous === undefined) {
      return notFound()
    }
    const body = (await request.json()) as WarehouseUpsertRequest
    const updated = {
      ...previous,
      code: body.code,
      nameAr: body.nameAr,
      locationAr: body.locationAr ?? null,
      rowVersion: previous.rowVersion + 1,
      status: body.status,
    }
    db.warehouses[db.warehouses.indexOf(previous)] = updated
    return HttpResponse.json(updated)
  }),
  http.get(`${AUTH_PREFIX}/warehouses/:warehouseId/capabilities`, async ({ params }) => {
    const capabilities = getDb().warehouseCapabilities.filter(
      (item) => item.warehouseId === params['warehouseId'],
    )
    return HttpResponse.json(capabilities)
  }),
  http.put(`${AUTH_PREFIX}/warehouses/:warehouseId/capabilities`, async ({ params, request }) => {
    const db = getDb()
    const body = (await request.json()) as readonly WarehouseCapabilityUpsertRequest[]
    const warehouseId = String(params['warehouseId'])
    db.warehouseCapabilities = body.map((item) => {
      const existing = db.warehouseCapabilities.find(
        (capability) =>
          capability.warehouseId === warehouseId && capability.domain.id === item.domainId,
      )
      return {
        capabilityId: existing?.capabilityId ?? nextFixtureUuid(),
        warehouseId,
        domain: {
          id: item.domainId,
          displayName: db.domains.find((domain) => domain.domainId === item.domainId)?.nameAr ?? '',
        },
        operations: [...item.operations],
        rowVersion: existing === undefined ? 1 : existing.rowVersion + 1,
      }
    })
    return HttpResponse.json(db.warehouseCapabilities)
  }),
  http.get(
    `${AUTH_PREFIX}/warehouses/:warehouseId/material-settings`,
    async ({ request, params }) => {
      const listParams = toListParams(new URL(request.url))
      const filtered = getDb().warehouseMaterialSettings.filter(
        (setting) =>
          setting.warehouseId === params['warehouseId'] &&
          matchesSearch(
            setting,
            listParams.search,
            (item) => `${item.material.displayName} ${item.material.code}`,
          ),
      )
      return pagedResponse(filtered, listParams)
    },
  ),
  http.put(
    `${AUTH_PREFIX}/warehouses/:warehouseId/material-settings`,
    async ({ request, params }) => {
      const body = (await request.json()) as WarehouseMaterialSettingUpsertRequest
      const db = getDb()
      const material = db.materials.find((item) => item.materialId === body.materialId)
      if (material === undefined) {
        const payload: ProblemDetails = {
          code: 'material.not_found',
          detailAr: 'المادة المحددة غير موجودة في السجل.',
          fieldErrors: [
            {
              field: 'materialId',
              code: 'material.not_found',
              messageAr: 'المادة المحددة غير موجودة في السجل.',
            },
          ],
          status: 400,
          titleAr: 'المادة غير موجودة',
          traceId: 'mock-trace',
          type: 'https://eiams.example/problems/material.not_found',
        }
        return HttpResponse.json(payload, { status: 400 })
      }
      const warehouseId = String(params['warehouseId'])
      const namedMaterial = createNamedReference({
        id: material.materialId,
        displayName: material.nameAr,
        code: material.code,
        status: material.status,
      })
      const existing = db.warehouseMaterialSettings.find(
        (setting) => setting.warehouseId === warehouseId && setting.material.id === body.materialId,
      )
      if (existing === undefined) {
        const created = createWarehouseMaterialSetting({
          settingId: nextFixtureUuid(),
          warehouseId,
          material: namedMaterial,
          minQuantity: body.minQuantity ?? null,
          maxQuantity: body.maxQuantity ?? null,
          status: body.status,
          rowVersion: 1,
        })
        db.warehouseMaterialSettings.push(created)
        return HttpResponse.json(created)
      }
      const updated: WarehouseMaterialSetting = {
        ...existing,
        material: namedMaterial,
        minQuantity: body.minQuantity ?? null,
        maxQuantity: body.maxQuantity ?? null,
        status: body.status,
        rowVersion: existing.rowVersion + 1,
      }
      db.warehouseMaterialSettings[db.warehouseMaterialSettings.indexOf(existing)] = updated
      return HttpResponse.json(updated)
    },
  ),

  // --- Inventory (development read projections only) -----------------------
  // These endpoints intentionally do not simulate effective scope, RBAC,
  // document posting, balance calculation, or ledger generation. Those remain
  // backend-authoritative; this worker merely makes the contracted read UI
  // observable during local Browser QA.
  http.get(`${INVENTORY_PREFIX}/balances`, ({ request }) => {
    const params = toListParams(new URL(request.url))
    if (params.sortBy !== undefined && !isOneOf(params.sortBy, BALANCE_SORT_FIELDS)) {
      return inventoryQueryProblem('sortBy')
    }
    if (params.sortDirection !== undefined && !isSortDirection(params.sortDirection)) {
      return inventoryQueryProblem('sortDirection')
    }
    if (params.lowStockState !== undefined && !isOneOf(params.lowStockState, LOW_STOCK_STATES)) {
      return inventoryQueryProblem('lowStockState')
    }

    const sortBy = isOneOf(params.sortBy, BALANCE_SORT_FIELDS)
      ? params.sortBy
      : 'WarehouseDisplayName'
    const sortDirection = isSortDirection(params.sortDirection) ? params.sortDirection : 'Ascending'
    const lowStockState = isOneOf(params.lowStockState, LOW_STOCK_STATES)
      ? params.lowStockState
      : undefined
    const filtered = getDb().inventoryBalances.filter(
      (balance) =>
        (params.warehouseId === undefined || balance.warehouse.id === params.warehouseId) &&
        (params.materialId === undefined || balance.material.id === params.materialId) &&
        (lowStockState === undefined || balance.lowStock.state === lowStockState) &&
        matchesSearch(
          balance,
          params.search,
          (item) => `${item.warehouse.displayName} ${item.material.displayName}`,
        ),
    )

    return pagedResponse(sortBalances(filtered, sortBy, sortDirection), params)
  }),
  http.get(`${INVENTORY_PREFIX}/balances/:balanceId`, ({ params }) => {
    const balance = getDb().inventoryBalances.find((item) => item.balanceId === params['balanceId'])
    return balance === undefined ? notFound() : HttpResponse.json(balance)
  }),
  http.get(`${INVENTORY_PREFIX}/movements`, ({ request }) => {
    const params = toListParams(new URL(request.url))
    if (params.sortBy !== undefined && !isOneOf(params.sortBy, MOVEMENT_SORT_FIELDS)) {
      return inventoryQueryProblem('sortBy')
    }
    if (params.sortDirection !== undefined && !isSortDirection(params.sortDirection)) {
      return inventoryQueryProblem('sortDirection')
    }
    if (params.movementType !== undefined && !isOneOf(params.movementType, MOVEMENT_TYPES)) {
      return inventoryQueryProblem('movementType')
    }

    const sortBy = isOneOf(params.sortBy, MOVEMENT_SORT_FIELDS) ? params.sortBy : 'PostedAt'
    const sortDirection = isSortDirection(params.sortDirection)
      ? params.sortDirection
      : 'Descending'
    const movementType = isOneOf(params.movementType, MOVEMENT_TYPES)
      ? params.movementType
      : undefined
    const filtered = getDb().stockMovements.filter(
      (movement) =>
        (params.warehouseId === undefined || movement.warehouse.id === params.warehouseId) &&
        (params.materialId === undefined || movement.material.id === params.materialId) &&
        (params.documentId === undefined || movement.documentId === params.documentId) &&
        (movementType === undefined || movement.movementType === movementType) &&
        (params.dateFrom === undefined || movement.postedAt >= params.dateFrom) &&
        (params.dateTo === undefined || movement.postedAt <= params.dateTo),
    )

    return pagedResponse(sortMovements(filtered, sortBy, sortDirection), params)
  }),
  http.get(`${INVENTORY_PREFIX}/movements/:movementId`, ({ params }) => {
    const movement = getDb().stockMovements.find((item) => item.movementId === params['movementId'])
    return movement === undefined ? notFound() : HttpResponse.json(movement)
  }),

  // --- Receiving: supplier suggestions --------------------------------------
  http.get(`${environment.apiBaseUrl}/receiving/suppliers`, async ({ request }) => {
    await delay(120)
    const search = new URL(request.url).searchParams.get('search') ?? ''
    const distinct = [
      ...new Set(
        getDb().warehouseDocuments.flatMap((document) =>
          document.receivingInfo === undefined ? [] : [document.receivingInfo.supplierRef],
        ),
      ),
    ]
    const normalized = search.trim().toLocaleLowerCase('ar')
    const matches =
      normalized.length === 0
        ? distinct
        : distinct.filter((supplier) => supplier.toLocaleLowerCase('ar').includes(normalized))
    return HttpResponse.json(matches.slice(0, 10))
  }),

  // --- Warehouse documents (shared document engine) -------------------------
  http.get(`${DOCUMENT_PREFIX}`, async ({ request }) => {
    await delay(150)
    const raw = toListParams(new URL(request.url))
    const filtered = getDb().warehouseDocuments.filter((document) =>
      documentListMatches(document, {
        ...raw,
        documentStatus: includedIn(raw.documentStatus, WAREHOUSE_DOCUMENT_STATUSES),
        documentType: includedIn(raw.documentType, WAREHOUSE_DOCUMENT_TYPES),
      }),
    )
    return pagedResponse(filtered, raw)
  }),
  http.post(`${DOCUMENT_PREFIX}`, async ({ request }) => {
    await delay(120)
    const body = (await request.json()) as WarehouseDocumentDraftRequest
    const db = getDb()
    const actor = documentActor()
    const document = buildDraftDocument(body, {
      documentId: nextFixtureUuid(),
      systemReferenceNumber: nextSystemReferenceNumber(body.documentType, body.paperDocumentYear),
      occurredBy: actor,
      lookups: draftLookups(),
    })
    db.warehouseDocuments.push(document)
    db.documentLifecycleEvents[document.documentId] = [
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: document.rowVersion,
        eventType: 'Created',
        occurredAt: document.createdAt,
        occurredBy: actor,
        toStatus: 'Draft',
      }),
    ]
    return HttpResponse.json(document, { status: 201 })
  }),
  http.put(`${DOCUMENT_PREFIX}/:documentId`, async ({ params, request }) => {
    await delay(120)
    const db = getDb()
    const index = db.warehouseDocuments.findIndex(
      (item) => item.documentId === params['documentId'],
    )
    if (index === -1) {
      return notFound()
    }
    const current = db.warehouseDocuments[index]!
    const body = (await request.json()) as WarehouseDocumentDraftRequest
    if (body.rowVersion !== current.rowVersion) {
      return HttpResponse.json(versionConflictProblem(current), { status: 409 })
    }
    const updated = applyDraftToDocument(current, body, draftLookups())
    db.warehouseDocuments[index] = updated
    return HttpResponse.json(updated)
  }),
  http.get(`${DOCUMENT_PREFIX}/:documentId`, async ({ params }) => {
    const document = getDb().warehouseDocuments.find(
      (item) => item.documentId === params['documentId'],
    )
    return document === undefined ? notFound() : HttpResponse.json(document)
  }),
  http.get(`${DOCUMENT_PREFIX}/:documentId/history`, async ({ params }) => {
    const db = getDb()
    const document = db.warehouseDocuments.find((item) => item.documentId === params['documentId'])
    if (document === undefined) {
      return notFound()
    }
    return HttpResponse.json({
      documentId: document.documentId,
      currentStatus: document.documentStatus,
      currentRowVersion: document.rowVersion,
      events: db.documentLifecycleEvents[document.documentId] ?? deriveLifecycleEvents(document),
    })
  }),
  http.get(`${DOCUMENT_PREFIX}/:documentId/policy`, async ({ params }) => {
    const document = getDb().warehouseDocuments.find(
      (item) => item.documentId === params['documentId'],
    )
    return document === undefined ? notFound() : HttpResponse.json(document.policy)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/submit`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Submit', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/post`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Post', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/reject`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Reject', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/revise`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Revise', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/cancel`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Cancel', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/reverse`, async ({ params, request }) => {
    await delay(120)
    return documentActionRoute('Reverse', params['documentId'], request)
  }),
  http.post(`${DOCUMENT_PREFIX}/:documentId/attachments`, async ({ params, request }) => {
    await delay(120)
    const db = getDb()
    const index = db.warehouseDocuments.findIndex(
      (item) => item.documentId === params['documentId'],
    )
    if (index === -1) {
      return notFound()
    }
    const document = db.warehouseDocuments[index]!
    if (document.documentStatus !== 'Draft') {
      return HttpResponse.json(attachmentUploadForbiddenProblem(), { status: 403 })
    }
    const form = await readRequestForm(request)
    const file = form.get('file')
    const attachmentType = form.get('attachmentType')
    const rowVersion = Number(form.get('rowVersion'))

    if (!isUploadedFile(file)) {
      return HttpResponse.json(attachmentValidationProblem('file', 'يجب إرفاق ملف مع طلب الرفع.'), {
        status: 422,
      })
    }
    if (attachmentType !== 'SignedOriginal' && attachmentType !== 'Supporting') {
      return HttpResponse.json(
        attachmentValidationProblem('attachmentType', 'نوع المرفق غير صالح.'),
        { status: 422 },
      )
    }
    if (!Number.isInteger(rowVersion)) {
      return HttpResponse.json(
        attachmentValidationProblem('rowVersion', 'قيمة rowVersion مطلوبة.'),
        { status: 422 },
      )
    }
    if (rowVersion !== document.rowVersion) {
      return HttpResponse.json(versionConflictProblem(document), { status: 409 })
    }

    const actor = documentActor()
    const attachment = createDocumentAttachment({
      attachmentId: nextFixtureUuid(),
      attachmentType: attachmentType as AttachmentType,
      checksum: `sha256:mock-${nextFixtureUuid()}`,
      documentId: document.documentId,
      downloadUrl: null,
      fileSize: file.size,
      mimeType: file.type,
      originalFilename: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: actor.userId, displayName: actor.displayName },
    })
    const attachments = [...document.attachments, attachment]
    const nextRowVersion = document.rowVersion + 1
    db.warehouseDocuments[index] = {
      ...document,
      attachments,
      rowVersion: nextRowVersion,
      policy: reEvaluateAttachmentPolicy(document, attachments, nextRowVersion),
    }
    return HttpResponse.json(attachment, { status: 201 })
  }),
  http.delete(
    `${DOCUMENT_PREFIX}/:documentId/attachments/:attachmentId`,
    async ({ params, request }) => {
      await delay(120)
      const db = getDb()
      const index = db.warehouseDocuments.findIndex(
        (item) => item.documentId === params['documentId'],
      )
      if (index === -1) {
        return notFound()
      }
      const document = db.warehouseDocuments[index]!
      const rowVersion = Number(new URL(request.url).searchParams.get('rowVersion'))
      if (!Number.isInteger(rowVersion)) {
        return HttpResponse.json(
          attachmentValidationProblem('rowVersion', 'قيمة rowVersion مطلوبة.'),
          { status: 422 },
        )
      }
      if (rowVersion !== document.rowVersion) {
        return HttpResponse.json(versionConflictProblem(document), { status: 409 })
      }
      if (document.documentStatus !== 'Draft') {
        return HttpResponse.json(attachmentDeleteForbiddenProblem(), { status: 403 })
      }
      const attachmentId = String(params['attachmentId'])
      if (!document.attachments.some((item) => item.attachmentId === attachmentId)) {
        return notFound()
      }
      const attachments = document.attachments.filter((item) => item.attachmentId !== attachmentId)
      const nextRowVersion = document.rowVersion + 1
      db.warehouseDocuments[index] = {
        ...document,
        attachments,
        rowVersion: nextRowVersion,
        policy: reEvaluateAttachmentPolicy(document, attachments, nextRowVersion),
      }
      return new HttpResponse(null, { status: 204 })
    },
  ),

  // --- Auth (dev scope switching) -------------------------------------------
  http.put(`${AUTH_PREFIX}/auth/active-scope`, async ({ request }) => {
    const body = (await request.json()) as SetActiveScopeRequest
    const session = createDevSession()
    return HttpResponse.json({
      ...session.session,
      activeScope: {
        ...(session.session.activeScope ?? {}),
        scopeType: body.scopeType,
        scopeId: body.scopeId,
      },
    })
  }),
  http.post(`${AUTH_PREFIX}/auth/logout`, () => new HttpResponse<never>(null, { status: 204 })),
]
