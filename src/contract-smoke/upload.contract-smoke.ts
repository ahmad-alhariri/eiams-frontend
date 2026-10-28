/**
 * Contract smoke — coverage item 7: the multipart attachment round trip
 * through the frontend's REAL attachment service and shared axios instance.
 *
 * Established wire facts:
 * - The multipart form binds `file`, `attachmentType`, `expectedRowVersion`
 *   (`eiams-backend/src/Web.Api/Controllers/WarehouseDocuments/UploadDocumentAttachmentController.cs`).
 * - A file WITHOUT a mime type reaches the backend as no content type and is
 *   rejected 400 `VALIDATION_GENERAL` with the FluentValidation body shape
 *   `{errors:[{code,description,...}]}`. The frontend's `toFieldError`
 *   (`src/shared/services/api-error.ts:120-135`) reads only `field`/`name`,
 *   so these entries are dropped — the live shape is asserted here and
 *   reported as a divergence, not fixed in this round.
 * - The content route answers the RAW bytes OUTSIDE the JSON envelope
 *   (`GetDocumentAttachmentContentController.cs`), so the download is read
 *   through the shared `apiClient` with `responseType: 'arraybuffer'` — the
 *   app's own instance and Authorization header, not a bare client.
 */
import axios from 'axios'
import { describe, it } from 'vitest'
import { documentService } from '@/shared/documents/document-transport'
import { attachmentService } from '@/shared/documents/document-attachment-service'
import { normalizeApiError } from '@/shared/services/api-error'
import { readApiError } from '@/shared/api/envelope'
import { apiClient } from '@/shared/services/api.client'
import { readWireCode, wireEvidence } from './contract-assert'
import { createFileSession } from './contract-session'
import './contract-api-base'

const WAREHOUSE_ID = '373ba70c-aa2c-466d-b9b5-a9df47abf8da'
const FILE_TEXT = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

const fileSession = createFileSession()

describe('contract-smoke: attachment upload + raw-byte download', () => {
  it('upload Supporting attachment via the service, download bytes match through apiClient', async () => {
    await fileSession.login('keeper')
    const documentId = await documentService.createDocument({
      warehouseId: WAREHOUSE_ID,
      documentType: 'Receiving',
    })
    const draft = await documentService.getDocument(documentId)
    const file = new File([FILE_TEXT], 'contract-smoke-69yr.pdf', { type: 'application/pdf' })
    const uploaded = await attachmentService.uploadAttachment(documentId, {
      attachmentType: 'Supporting',
      file,
      expectedRowVersion: draft.rowVersion,
    })
    if (
      uploaded.attachment.mimeType !== 'application/pdf' ||
      uploaded.attachment.originalFilename !== 'contract-smoke-69yr.pdf'
    ) {
      throw new Error(
        `UPLOAD METADATA DIVERGENCE: observed status=200 body=${JSON.stringify(uploaded).slice(0, 400)}`,
      )
    }
    // The content route answers RAW BYTES outside the envelope — read through
    // the app's own shared instance (Authorization interceptor included).
    const response = await apiClient.get<ArrayBuffer>(
      attachmentService.attachmentContentPath(documentId, uploaded.attachment.id),
      { responseType: 'arraybuffer' },
    )
    if (response.status !== 200) {
      throw new Error(
        `DOWNLOAD DIVERGENCE: expected 200 — observed status=${response.status} body=${JSON.stringify(response.data).slice(0, 400)}`,
      )
    }
    const downloaded = new Uint8Array(response.data)
    const expected = new TextEncoder().encode(FILE_TEXT)
    if (
      downloaded.length !== expected.length ||
      !expected.every((byte, i) => downloaded[i] === byte)
    ) {
      throw new Error(
        `DOWNLOAD MISMATCH: observed status=${response.status} downloadedBytes=${downloaded.length} expectedBytes=${expected.length}`,
      )
    }
  })

  it('file WITHOUT a mime type -> exact 415 DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED', async () => {
    await fileSession.login('keeper')
    const documentId = await documentService.createDocument({
      warehouseId: WAREHOUSE_ID,
      documentType: 'Receiving',
    })
    const draft = await documentService.getDocument(documentId)
    const noMime = new File([FILE_TEXT], 'contract-smoke-no-mime.txt')
    try {
      await attachmentService.uploadAttachment(documentId, {
        attachmentType: 'Supporting',
        file: noMime,
        expectedRowVersion: draft.rowVersion,
      })
      throw new Error(
        'NO-MIME UPLOAD DIVERGENCE: expected 415 but the upload SUCCEEDED - a file without a content type was accepted',
      )
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 415) {
        throw new Error(`no-mime upload: expected status=415 - ${wireEvidence(error)}`, {
          cause: error,
        })
      }
      const code = readWireCode(error)
      if (code !== 'DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED') {
        throw new Error(
          `no-mime upload: expected code=DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED - observed code=${code ?? 'NO_CODE'} body=${JSON.stringify(error.response.data).slice(0, 400)}`,
          { cause: error },
        )
      }
      // The backend answers 415 (unsupported media type) and names the offending
      // mime in details.mime_type. There is no FluentValidation errors[] shape
      // on this path, so the earlier 400 expectation was a guess, not a reading.
      const details = readApiError(error.response.data)?.details as
        { mime_type?: string } | undefined
      if (details?.mime_type !== 'application/octet-stream') {
        throw new Error(
          `MIME DETAILS DIVERGENCE: expected details.mime_type=application/octet-stream - observed details=${JSON.stringify(details).slice(0, 400)}`,
          { cause: error },
        )
      }
      // The frontend Arabic copy table already carries this code, so the
      // shared reporter resolves it - assert the normalized code, never the
      // English wire message.
      const normalized = normalizeApiError(error)
      if (normalized.code !== 'DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED') {
        throw new Error(
          `NORMALIZED CODE DIVERGENCE: expected code=DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED - observed code=${normalized.code ?? 'NO_CODE'} titleAr=${normalized.titleAr}`,
          { cause: error },
        )
      }
    }
  })
})
