import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
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
export function createDocumentAttachmentService(
  transport: ApiTransport,
): DocumentAttachmentService {
  return {
    async uploadAttachment(documentId, file, attachmentType, rowVersion) {
      const form = new FormData()
      form.append('file', file)
      form.append('attachmentType', attachmentType)
      form.append('rowVersion', String(rowVersion))
      const response = await transport.request<DocumentAttachment>({
        path: pathWithSegments(ATTACHMENTS_PATH, documentId),
        method: 'POST',
        // No Content-Type: the browser must add the multipart boundary, which is
        // why the transport passes the body through untouched.
        body: form,
      })
      return response.data
    },
    async deleteAttachment(documentId, attachmentId, rowVersion) {
      await transport.requestEmpty({
        path: pathWithSegments(ATTACHMENT_PATH, documentId, attachmentId),
        method: 'DELETE',
        query: { rowVersion },
      })
    },
  }
}

export const attachmentService = createDocumentAttachmentService(apiTransport)
