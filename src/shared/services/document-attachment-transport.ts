import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { AttachmentType, DocumentAttachment, paths } from '@/shared/types/generated/eiams-v1'

const DOCUMENT_ATTACHMENTS_PATH =
  '/warehouse-documents/{documentId}/attachments' satisfies keyof paths
const DOCUMENT_ATTACHMENT_PATH =
  '/warehouse-documents/{documentId}/attachments/{attachmentId}' satisfies keyof paths

export interface UploadDocumentAttachmentRequest {
  attachmentType: AttachmentType
  file: File
  rowVersion: number
}

export interface DeleteDocumentAttachmentRequest {
  attachmentId: string
  rowVersion: number
}

export interface DocumentAttachmentTransport {
  list: (documentId: string) => Promise<readonly DocumentAttachment[]>
  upload: (
    documentId: string,
    request: UploadDocumentAttachmentRequest,
  ) => Promise<DocumentAttachment>
  delete: (documentId: string, request: DeleteDocumentAttachmentRequest) => Promise<void>
}

function interpolatePath(
  template: typeof DOCUMENT_ATTACHMENTS_PATH | typeof DOCUMENT_ATTACHMENT_PATH,
  documentId: string,
  attachmentId?: string,
): string {
  return template
    .replace('{documentId}', encodeURIComponent(documentId))
    .replace(
      '{attachmentId}',
      attachmentId === undefined ? '{attachmentId}' : encodeURIComponent(attachmentId),
    )
}

/**
 * Converts the browser's transient File into the exact multipart request
 * described by D-ATT-01. Deliberately do not set Content-Type: Axios/browser
 * must add the boundary. Files are never retained after the request finishes.
 */
export function createDocumentAttachmentFormData(
  request: UploadDocumentAttachmentRequest,
): FormData {
  const formData = new FormData()
  formData.append('attachmentType', request.attachmentType)
  formData.append('file', request.file)
  formData.append('rowVersion', String(request.rowVersion))
  return formData
}

/**
 * Contract-only attachment transport. It does not infer signed-copy validity,
 * build download URLs, inspect checksums, or normalize/present API failures.
 */
export function createDocumentAttachmentTransport(
  transport: ApiTransport,
): DocumentAttachmentTransport {
  return {
    async list(documentId) {
      const response = await transport.request<readonly DocumentAttachment[]>({
        path: interpolatePath(DOCUMENT_ATTACHMENTS_PATH, documentId),
        method: 'GET',
      })
      return response.data
    },
    async upload(documentId, request) {
      const response = await transport.request<DocumentAttachment>({
        path: interpolatePath(DOCUMENT_ATTACHMENTS_PATH, documentId),
        method: 'POST',
        body: createDocumentAttachmentFormData(request),
      })
      return response.data
    },
    async delete(documentId, request) {
      await transport.requestEmpty({
        path: interpolatePath(DOCUMENT_ATTACHMENT_PATH, documentId, request.attachmentId),
        method: 'DELETE',
        query: { rowVersion: request.rowVersion },
      })
    },
  }
}

export const documentAttachmentTransport = createDocumentAttachmentTransport(apiTransport)
