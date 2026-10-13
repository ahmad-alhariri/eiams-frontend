import type { ApiTransport } from '@/shared/api/api-transport'
import { apiTransport } from '@/shared/api/transport'
import type { DocumentAttachmentResponse, Uuid } from '@/shared/documents/types/document-wire.types'

const ATTACHMENTS_PATH = '/warehouse-documents/{documentId}/attachments'
const ATTACHMENT_PATH = '/warehouse-documents/{documentId}/attachments/{attachmentId}'
const ATTACHMENT_CONTENT_PATH = '/warehouse-documents/{documentId}/attachments/{attachmentId}/content'

function pathWithSegments(path: string, documentId: Uuid, attachmentId?: Uuid): string {
  return path
    .replace('{documentId}', encodeURIComponent(documentId))
    .replace('{attachmentId}', encodeURIComponent(attachmentId ?? ''))
}

/**
 * `Domain.Common.AttachmentType`. The wire projection types `attachmentType` as a
 * bare string, so the enum is pinned here at the one place that WRITES it: the
 * multipart form field binds `AttachmentType`, and an unrecognised value is a 400.
 */
export type AttachmentType = 'SignedOriginal' | 'Supporting'

export interface UploadDocumentAttachmentRequest {
  readonly attachmentType: AttachmentType
  readonly file: File
  /** The document version the user was shown, so a stale upload is rejected. */
  readonly expectedRowVersion: number
}

export interface DocumentAttachmentService {
  /** Uploads one attachment as `multipart/form-data`. */
  uploadAttachment: (
    documentId: Uuid,
    request: Readonly<UploadDocumentAttachmentRequest>,
  ) => Promise<DocumentAttachmentResponse>
  /** Deletes a draft attachment guarded by the document version QUERY parameter. */
  deleteAttachment: (documentId: Uuid, attachmentId: Uuid, expectedRowVersion: number) => Promise<void>
  /**
   * The absolute content path for an attachment. The route answers the raw file
   * bytes OUTSIDE the JSON envelope, so it is deliberately not a transport read —
   * the caller hands it to a browser download/open, which carries the session
   * cookie the transport does not.
   */
  attachmentContentPath: (documentId: Uuid, attachmentId: Uuid) => string
}

/**
 * Converts the browser's transient File into the exact multipart request
 * `UploadDocumentAttachmentController.RequestForm` binds: `file`,
 * `attachmentType` and `expectedRowVersion`.
 *
 * Content-Type is deliberately NOT set: the browser must add the multipart
 * boundary. Files are never retained after the request finishes.
 */
export function createAttachmentUploadFormData(
  request: Readonly<UploadDocumentAttachmentRequest>,
): FormData {
  const formData = new FormData()
  formData.append('attachmentType', request.attachmentType)
  formData.append('file', request.file)
  formData.append('expectedRowVersion', String(request.expectedRowVersion))
  return formData
}

/**
 * THE attachment transport for the document engine (`eiams-frontend-71fp`).
 *
 * This file absorbs `src/shared/services/document-attachment-transport.ts`, which
 * was a second, near-identical implementation of the same three routes built on
 * the provisional snapshot's `rowVersion` multipart field and `DocumentAttachment`
 * response. Two attachment transports is a defect: a fix applied to one is
 * silently absent from the other, and only one of them was reachable from the UI.
 *
 * Contract-only: it does not infer signed-copy validity, build download URLs,
 * inspect checksums, or normalize/present API failures.
 */
export function createDocumentAttachmentService(
  transport: ApiTransport,
): DocumentAttachmentService {
  return {
    async uploadAttachment(documentId, request) {
      return transport.request<DocumentAttachmentResponse, FormData>({
        path: pathWithSegments(ATTACHMENTS_PATH, documentId),
        method: 'POST',
        // No Content-Type: the browser must add the multipart boundary, which is
        // why the transport passes the body through untouched.
        body: createAttachmentUploadFormData(request),
      })
    },
    async deleteAttachment(documentId, attachmentId, expectedRowVersion) {
      await transport.requestEmpty({
        path: pathWithSegments(ATTACHMENT_PATH, documentId, attachmentId),
        method: 'DELETE',
        query: { expectedRowVersion },
      })
    },
    attachmentContentPath(documentId, attachmentId) {
      return pathWithSegments(ATTACHMENT_CONTENT_PATH, documentId, attachmentId)
    },
  }
}

export const attachmentService = createDocumentAttachmentService(apiTransport)