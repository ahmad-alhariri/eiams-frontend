import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import { IDEMPOTENCY_KEY_HEADER, type IdempotentRequest } from '@/shared/services/mutation-safety'
import type {
  CompleteDraftRequest,
  CreateDocumentRequest,
  DocumentLifecycleHistory,
  DocumentPolicy,
  ListWarehouseDocumentsQuery,
  PostDocumentResponse,
  ReasonedDocumentActionRequest,
  ResourceIdResponse,
  UpdatePaperReferenceRequest,
  Uuid,
  VersionedDocumentActionRequest,
  WarehouseDocumentDetails,
  WarehouseDocumentSummary,
} from '@/shared/documents/types/document-wire.types'

const DOCUMENTS_PATH = '/warehouse-documents'
const DOCUMENT_PATH = '/warehouse-documents/{documentId}'
const DOCUMENT_SUBMIT_PATH = '/warehouse-documents/{documentId}/submit'
const DOCUMENT_POST_PATH = '/warehouse-documents/{documentId}/post'
const DOCUMENT_REJECT_PATH = '/warehouse-documents/{documentId}/reject'
const DOCUMENT_CANCEL_PATH = '/warehouse-documents/{documentId}/cancel'
const DOCUMENT_RETURN_TO_DRAFT_PATH = '/warehouse-documents/{documentId}/return-to-draft'
const DOCUMENT_REVERSALS_PATH = '/warehouse-documents/{documentId}/reversals'
const DOCUMENT_HISTORY_PATH = '/warehouse-documents/{documentId}/history'
const DOCUMENT_POLICY_PATH = '/warehouse-documents/{documentId}/policy'
const DOCUMENT_PAPER_REFERENCE_PATH = '/warehouse-documents/{documentId}/paper-reference'
const DOCUMENTS_COMPLETE_DRAFT_PATH = '/warehouse-documents/complete-draft'

function pathWithDocumentId(path: string, documentId: Uuid): string {
  return path.replace('{documentId}', encodeURIComponent(documentId))
}

/**
 * Optional filters are spread conditionally so an unset filter never leaks an
 * `undefined` key onto the wire, which would otherwise reach the model binder
 * as a supplied-but-empty parameter.
 */
function toQueryParams(query: ListWarehouseDocumentsQuery) {
  return {
    ...(query.documentStatus === undefined ? {} : { documentStatus: query.documentStatus }),
    ...(query.documentType === undefined ? {} : { documentType: query.documentType }),
    ...(query.fromDateUtc === undefined ? {} : { fromDateUtc: query.fromDateUtc }),
    ...(query.paperDocumentNumber === undefined
      ? {}
      : { paperDocumentNumber: query.paperDocumentNumber }),
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.systemReferenceNumber === undefined
      ? {}
      : { systemReferenceNumber: query.systemReferenceNumber }),
    ...(query.toDateUtc === undefined ? {} : { toDateUtc: query.toDateUtc }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
    ...toWireOneBasedPaginationParams(query),
  }
}

function versionOnly(rowVersion: number): VersionedDocumentActionRequest {
  return { expectedRowVersion: rowVersion }
}

function reasoned(rowVersion: number, reason: string): ReasonedDocumentActionRequest {
  return { expectedRowVersion: rowVersion, reason }
}

export interface DocumentService {
  listDocuments: (
    query: Readonly<ListWarehouseDocumentsQuery>,
  ) => Promise<ApiPage<WarehouseDocumentSummary>>
  getDocument: (documentId: Uuid) => Promise<WarehouseDocumentDetails>
  /**
   * Creates an empty document. The route answers `201 { id }` and nothing
   * else, so a caller that needs the created row must follow with `getDocument`.
   */
  createDocument: (request: Readonly<CreateDocumentRequest>) => Promise<Uuid>
  /**
   * Creates a document together with its lines and petal details in one
   * idempotent write, and answers the whole detail read. This is the route a
   * form that saves lines must use.
   */
  completeDraft: (
    request: Readonly<CompleteDraftRequest>,
    idempotentRequest: IdempotentRequest,
  ) => Promise<WarehouseDocumentDetails>
  updatePaperReference: (
    documentId: Uuid,
    request: Readonly<UpdatePaperReferenceRequest>,
  ) => Promise<void>
  getDocumentHistory: (documentId: Uuid) => Promise<DocumentLifecycleHistory>
  getDocumentPolicy: (documentId: Uuid) => Promise<DocumentPolicy>
  submitDocument: (
    documentId: Uuid,
    rowVersion: number,
    idempotentRequest: IdempotentRequest,
  ) => Promise<void>
  postDocument: (
    documentId: Uuid,
    rowVersion: number,
    idempotentRequest: IdempotentRequest,
  ) => Promise<PostDocumentResponse>
  returnToDraft: (
    documentId: Uuid,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<void>
  rejectDocument: (
    documentId: Uuid,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<void>
  cancelDocument: (
    documentId: Uuid,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<void>
  /**
   * Creates the compensating document. The route takes no body and answers
   * `201 { id }` for the NEW document; the caller must re-read the original to
   * observe it becoming Reversed.
   */
  reverseDocument: (documentId: Uuid, idempotentRequest: IdempotentRequest) => Promise<Uuid>
}

/**
 * Contract-only warehouse-document transport. The API remains authoritative
 * for workflow state, policy evaluation, and optimistic-concurrency conflicts.
 */
export function createDocumentService(transport: ApiTransport): DocumentService {
  /**
   * Lifecycle actions answer `EmptyResponse`, so the only honest result is the
   * acknowledgement: the server carries no post-action state and inventing a
   * local transition would show an event that never happened. Callers re-read
   * the document, policy and history instead.
   */
  const executeEmptyAction = async (
    path: string,
    request: VersionedDocumentActionRequest | ReasonedDocumentActionRequest,
    idempotentRequest: IdempotentRequest,
  ): Promise<void> => {
    await transport.requestEmpty({
      path,
      method: 'POST',
      body: request,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotentRequest.idempotencyKey },
    })
  }

  return {
    async listDocuments(query) {
      return transport.requestPage<WarehouseDocumentSummary>({
        path: DOCUMENTS_PATH,
        method: 'GET',
        query: toQueryParams(query),
      })
    },
    async getDocument(documentId) {
      return transport.request<WarehouseDocumentDetails>({
        path: pathWithDocumentId(DOCUMENT_PATH, documentId),
        method: 'GET',
      })
    },
    async createDocument(request) {
      const created = await transport.request<ResourceIdResponse>({
        path: DOCUMENTS_PATH,
        method: 'POST',
        body: request,
      })
      return created.id
    },
    async completeDraft(request, idempotentRequest) {
      return transport.request<WarehouseDocumentDetails, CompleteDraftRequest>({
        path: DOCUMENTS_COMPLETE_DRAFT_PATH,
        method: 'POST',
        body: request,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotentRequest.idempotencyKey },
      })
    },
    async updatePaperReference(documentId, request) {
      await transport.requestEmpty({
        path: pathWithDocumentId(DOCUMENT_PAPER_REFERENCE_PATH, documentId),
        method: 'PUT',
        body: request,
      })
    },
    async getDocumentHistory(documentId) {
      return transport.request<DocumentLifecycleHistory>({
        path: pathWithDocumentId(DOCUMENT_HISTORY_PATH, documentId),
        method: 'GET',
      })
    },
    async getDocumentPolicy(documentId) {
      return transport.request<DocumentPolicy>({
        path: pathWithDocumentId(DOCUMENT_POLICY_PATH, documentId),
        method: 'GET',
      })
    },
    async submitDocument(documentId, rowVersion, idempotentRequest) {
      return executeEmptyAction(
        pathWithDocumentId(DOCUMENT_SUBMIT_PATH, documentId),
        versionOnly(rowVersion),
        idempotentRequest,
      )
    },
    async postDocument(documentId, rowVersion, idempotentRequest) {
      return transport.request<PostDocumentResponse, VersionedDocumentActionRequest>({
        path: pathWithDocumentId(DOCUMENT_POST_PATH, documentId),
        method: 'POST',
        body: versionOnly(rowVersion),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotentRequest.idempotencyKey },
      })
    },
    async returnToDraft(documentId, rowVersion, reason, idempotentRequest) {
      return executeEmptyAction(
        pathWithDocumentId(DOCUMENT_RETURN_TO_DRAFT_PATH, documentId),
        reasoned(rowVersion, reason),
        idempotentRequest,
      )
    },
    async rejectDocument(documentId, rowVersion, reason, idempotentRequest) {
      return executeEmptyAction(
        pathWithDocumentId(DOCUMENT_REJECT_PATH, documentId),
        reasoned(rowVersion, reason),
        idempotentRequest,
      )
    },
    async cancelDocument(documentId, rowVersion, reason, idempotentRequest) {
      return executeEmptyAction(
        pathWithDocumentId(DOCUMENT_CANCEL_PATH, documentId),
        reasoned(rowVersion, reason),
        idempotentRequest,
      )
    },
    async reverseDocument(documentId, idempotentRequest) {
      const reversal = await transport.request<ResourceIdResponse>({
        path: pathWithDocumentId(DOCUMENT_REVERSALS_PATH, documentId),
        method: 'POST',
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotentRequest.idempotencyKey },
      })
      return reversal.id
    },
  }
}

export const documentService = createDocumentService(apiTransport)
