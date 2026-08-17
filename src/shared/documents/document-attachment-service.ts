import type { AxiosInstance } from 'axios'

import { apiClient } from '@/shared/services/api.client'
import type { AttachmentType, DocumentAttachment, paths } from '@/shared/types/generated/eiams-v1'

const ATTACHMENTS_PATH = '/warehouse-documents/{documentId}/attachments' satisfies keyof paths
const ATTACHMENT_PATH =
  '/warehouse-documents/{documentId}/attachments/{attachmentId}' satisfies keyof paths

function pathWithSegments(path: string, documentId: string, attachmentId?: string): string {
  return path
    .replace('{documentId}', encodeURIComponent(documentId))
    .replace('{attachmentId}', encodeURIComponent(attachmentId ?? ''))
}

export interface DocumentAttachmentService {
  /**
   * Uploads one attachment as `multipart/form-data`. The multipart body carries
   * exactly the `AttachmentUploadRequest` fields the contract declares: `file`,
   * `attachmentType`, and the optimistic-concurrency `rowVersion`.
   */
  uploadAttachment: (
    documentId: string,
    file: File | Blob,
    attachmentType: AttachmentType,
    rowVersion: number,
  ) => Promise<DocumentAttachment>
  /** Deletes a draft attachment guarded by the document `rowVersion` query. */
  deleteAttachment: (documentId: string, attachmentId: string, rowVersion: number) => Promise<void>
}

/**
 * Contract-only attachment transport. Multipart is built per the verified
 * `AttachmentUploadRequest` schema; version conflicts surface through the
 * shared Arabic error normalizer, never pre-validated here.
 */
export function createDocumentAttachmentService(client: AxiosInstance): DocumentAttachmentService {
  return {
    async uploadAttachment(documentId, file, attachmentType, rowVersion) {
      const form = new FormData()
      form.append('file', file)
      form.append('attachmentType', attachmentType)
      form.append('rowVersion', String(rowVersion))
      const response = await client.post<DocumentAttachment>(
        pathWithSegments(ATTACHMENTS_PATH, documentId),
        form,
      )
      return response.data
    },
    async deleteAttachment(documentId, attachmentId, rowVersion) {
      await client.delete(pathWithSegments(ATTACHMENT_PATH, documentId, attachmentId), {
        params: { rowVersion },
      })
    },
  }
}

export const attachmentService = createDocumentAttachmentService(apiClient)
