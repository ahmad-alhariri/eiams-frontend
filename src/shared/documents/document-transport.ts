import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type { IdempotentRequest } from '@/shared/services/mutation-safety'
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
  WarehouseDocumentPage,
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
 */
function toQueryParams(query: ListWarehouseDocumentsQuery) {
  return {
    ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
    ...(query.documentStatus === undefined ? {} : { documentStatus: query.documentStatus }),
    ...(query.documentType === undefined ? {} : { documentType: query.documentType }),
    ...(query.pageIndex === undefined ? {} : { pageIndex: query.pageIndex }),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
  }
}

export interface DocumentService {
  listDocuments: (query: Readonly<ListWarehouseDocumentsQuery>) => Promise<WarehouseDocumentPage>
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
export function createDocumentService(client: AxiosInstance): DocumentService {
  const executeAction = async (
    path: string,
    request: VersionOnlyDocumentActionRequest | ReasonedDocumentActionRequest,
    idempotentRequest: IdempotentRequest,
  ): Promise<DocumentActionResult> => {
    const response = await client.post<DocumentActionResult>(
      path,
      request,
      idempotentRequest.config,
    )
    return response.data
  }

  return {
    async listDocuments(query) {
      const response = await client.get<WarehouseDocumentPage>(DOCUMENTS_PATH, {
        params: toQueryParams(query),
      })
      return response.data
    },
    async getDocument(documentId) {
      const response = await client.get<WarehouseDocument>(
        pathWithDocumentId(DOCUMENT_PATH, documentId),
      )
      return response.data
    },
    async createDocument(request) {
      const response = await client.post<WarehouseDocument>(DOCUMENTS_PATH, request)
      return response.data
    },
    async updateDocument(documentId, request) {
      const response = await client.put<WarehouseDocument>(
        pathWithDocumentId(DOCUMENT_PATH, documentId),
        request,
      )
      return response.data
    },
    async getDocumentHistory(documentId) {
      const response = await client.get<DocumentLifecycleHistory>(
        pathWithDocumentId(DOCUMENT_HISTORY_PATH, documentId),
      )
      return response.data
    },
    async getDocumentPolicy(documentId) {
      const response = await client.get<DocumentPolicy>(
        pathWithDocumentId(DOCUMENT_POLICY_PATH, documentId),
      )
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

export const documentService = createDocumentService(apiClient)
