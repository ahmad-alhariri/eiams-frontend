import type { ApiPage } from '@/shared/api/api-contracts'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import { toWirePaginationParams } from '@/shared/api/pagination'
import { IDEMPOTENCY_KEY_HEADER, type IdempotentRequest } from '@/shared/services/mutation-safety'
import type {
  DocumentActionResult,
  DocumentLifecycleHistory,
  DocumentPolicy,
  operations,
  paths,
  ReasonedDocumentActionRequest,
  VersionOnlyDocumentActionRequest,
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

const DOCUMENTS_PATH = '/warehouse-documents' satisfies keyof paths
const DOCUMENT_PATH = '/warehouse-documents/{documentId}' satisfies keyof paths
const DOCUMENT_CANCEL_PATH = '/warehouse-documents/{documentId}/cancel' satisfies keyof paths
const DOCUMENT_HISTORY_PATH = '/warehouse-documents/{documentId}/history' satisfies keyof paths
const DOCUMENT_POLICY_PATH = '/warehouse-documents/{documentId}/policy' satisfies keyof paths
const DOCUMENT_POST_PATH = '/warehouse-documents/{documentId}/post' satisfies keyof paths
const DOCUMENT_REJECT_PATH = '/warehouse-documents/{documentId}/reject' satisfies keyof paths
const DOCUMENT_REVERSE_PATH = '/warehouse-documents/{documentId}/reverse' satisfies keyof paths
const DOCUMENT_REVISE_PATH = '/warehouse-documents/{documentId}/revise' satisfies keyof paths
const DOCUMENT_SUBMIT_PATH = '/warehouse-documents/{documentId}/submit' satisfies keyof paths

export type ListWarehouseDocumentsQuery = NonNullable<
  operations['listWarehouseDocuments']['parameters']['query']
>

function pathWithDocumentId(path: string, documentId: string): string {
  return path.replace('{documentId}', encodeURIComponent(documentId))
}

function versionOnlyAction(rowVersion: number): VersionOnlyDocumentActionRequest {
  return { rowVersion }
}

function reasonedAction(rowVersion: number, reason: string): ReasonedDocumentActionRequest {
  return { reason, rowVersion }
}

/**
 * Builds axios params with conditional spreads so optional filters never leak
 * `undefined` keys onto the wire, keeping the request exactOptional-safe.
 * Page conversion is delegated to the shared boundary so the one-based UI
 * model and the zero-based wire index are converted in one place.
 */
function toQueryParams(query: ListWarehouseDocumentsQuery) {
  return {
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
    ...(query.documentStatus === undefined ? {} : { documentStatus: query.documentStatus }),
    ...(query.documentType === undefined ? {} : { documentType: query.documentType }),
    ...toWirePaginationParams(query),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

export interface DocumentService {
  listDocuments: (
    query: Readonly<ListWarehouseDocumentsQuery>,
  ) => Promise<ApiPage<WarehouseDocument>>
  getDocument: (documentId: string) => Promise<WarehouseDocument>
  createDocument: (request: Readonly<WarehouseDocumentDraftRequest>) => Promise<WarehouseDocument>
  updateDocument: (
    documentId: string,
    request: Readonly<WarehouseDocumentDraftRequest>,
  ) => Promise<WarehouseDocument>
  getDocumentHistory: (documentId: string) => Promise<DocumentLifecycleHistory>
  getDocumentPolicy: (documentId: string) => Promise<DocumentPolicy>
  submitDocument: (
    documentId: string,
    rowVersion: number,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
  postDocument: (
    documentId: string,
    rowVersion: number,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
  reviseDocument: (
    documentId: string,
    rowVersion: number,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
  rejectDocument: (
    documentId: string,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
  cancelDocument: (
    documentId: string,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
  reverseDocument: (
    documentId: string,
    rowVersion: number,
    reason: string,
    idempotentRequest: IdempotentRequest,
  ) => Promise<DocumentActionResult>
}

/**
 * Contract-only warehouse-document transport. The API remains authoritative
 * for workflow state, policy evaluation, and optimistic-concurrency conflicts.
 */
export function createDocumentService(transport: ApiTransport): DocumentService {
  const executeAction = async (
    path: string,
    request: VersionOnlyDocumentActionRequest | ReasonedDocumentActionRequest,
    idempotentRequest: IdempotentRequest,
  ): Promise<DocumentActionResult> => {
    const response = await transport.request<DocumentActionResult>({
      path,
      method: 'POST',
      body: request,
      // Read the typed `idempotencyKey` rather than digging through the Axios
      // config, so the header cannot drift from the key the caller holds.
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotentRequest.idempotencyKey },
    })
    return response.data
  }

  return {
    async listDocuments(query) {
      return transport.requestPage<WarehouseDocument>({
        path: DOCUMENTS_PATH,
        method: 'GET',
        query: toQueryParams(query),
      })
    },
    async getDocument(documentId) {
      const response = await transport.request<WarehouseDocument>({
        path: pathWithDocumentId(DOCUMENT_PATH, documentId),
        method: 'GET',
      })
      return response.data
    },
    async createDocument(request) {
      const response = await transport.request<WarehouseDocument>({
        path: DOCUMENTS_PATH,
        method: 'POST',
        body: request,
      })
      return response.data
    },
    async updateDocument(documentId, request) {
      const response = await transport.request<WarehouseDocument>({
        path: pathWithDocumentId(DOCUMENT_PATH, documentId),
        method: 'PUT',
        body: request,
      })
      return response.data
    },
    async getDocumentHistory(documentId) {
      const response = await transport.request<DocumentLifecycleHistory>({
        path: pathWithDocumentId(DOCUMENT_HISTORY_PATH, documentId),
        method: 'GET',
      })
      return response.data
    },
    async getDocumentPolicy(documentId) {
      const response = await transport.request<DocumentPolicy>({
        path: pathWithDocumentId(DOCUMENT_POLICY_PATH, documentId),
        method: 'GET',
      })
      return response.data
    },
    async submitDocument(documentId, rowVersion, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_SUBMIT_PATH, documentId),
        versionOnlyAction(rowVersion),
        idempotentRequest,
      )
    },
    async postDocument(documentId, rowVersion, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_POST_PATH, documentId),
        versionOnlyAction(rowVersion),
        idempotentRequest,
      )
    },
    async reviseDocument(documentId, rowVersion, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_REVISE_PATH, documentId),
        versionOnlyAction(rowVersion),
        idempotentRequest,
      )
    },
    async rejectDocument(documentId, rowVersion, reason, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_REJECT_PATH, documentId),
        reasonedAction(rowVersion, reason),
        idempotentRequest,
      )
    },
    async cancelDocument(documentId, rowVersion, reason, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_CANCEL_PATH, documentId),
        reasonedAction(rowVersion, reason),
        idempotentRequest,
      )
    },
    async reverseDocument(documentId, rowVersion, reason, idempotentRequest) {
      return executeAction(
        pathWithDocumentId(DOCUMENT_REVERSE_PATH, documentId),
        reasonedAction(rowVersion, reason),
        idempotentRequest,
      )
    },
  }
}

export const documentService = createDocumentService(apiTransport)
