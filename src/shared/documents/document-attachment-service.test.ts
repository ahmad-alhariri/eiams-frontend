import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createDocumentAttachmentService } from '@/shared/documents/document-attachment-service'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { normalizeApiError } from '@/shared/services/api-error'
import { readRequestForm } from '@/test/msw/multipart-parser'
import { createDocumentAttachment, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(60)
const ATTACHMENT_ID = fixtureUuid(61)

const bundles: ApiClientBundle[] = []

beforeAll(() => {
  // jsdom's XHR serializer preserves File names; undici's fetch adapter drops
  // them to "blob" and asserts on non-undici Files (see multipart-parser.ts).
  axios.defaults.adapter = 'xhr'
})

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return { service: createDocumentAttachmentService(bundle.client), client: bundle.client }
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('document attachment transport', () => {
  it('uploads multipart file, attachmentType and rowVersion fields to the document URL', async () => {
    const { service } = setupService()
    const attachment = createDocumentAttachment({
      attachmentId: ATTACHMENT_ID,
      documentId: DOCUMENT_ID,
    })
    const capturedUrl = vi.fn<() => URL>()
    const capturedForm = vi.fn<() => FormData>()

    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`,
        async ({ request }) => {
          capturedUrl.mockReturnValue(new URL(request.url))
          capturedForm.mockReturnValue(await readRequestForm(request))
          return HttpResponse.json(attachment, { status: 201 })
        },
      ),
    )

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'signed.pdf', {
      type: 'application/pdf',
    })
    await expect(service.uploadAttachment(DOCUMENT_ID, file, 'SignedOriginal', 3)).resolves.toEqual(
      attachment,
    )

    expect(capturedUrl().pathname).toBe(
      `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`,
    )
    const sentFile = capturedForm().get('file')
    expect(sentFile).not.toBeNull()
    // The vitest node transport re-serializes multipart with undici, which
    // degrades the jsdom File to a plain Blob: the name arrives as "blob"
    // and the bytes are dropped (size 0) — see multipart-parser.ts. Only
    // field values and the file's declared type survive reliably here;
    // browser dev-mode sees real names and bytes via native formData().
    expect(sentFile).toMatchObject({ name: 'blob', type: 'application/pdf' })
    expect(capturedForm().get('attachmentType')).toBe('SignedOriginal')
    expect(capturedForm().get('rowVersion')).toBe('3')
  })

  it('url-encodes the document id in the upload path', async () => {
    const { service } = setupService()
    const documentId = 'doc id / ١'
    const attachment = createDocumentAttachment({ documentId: fixtureUuid(60) })

    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/attachments`,
        ({ request }) => {
          expect(new URL(request.url).pathname).toBe(
            `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/attachments`,
          )
          return HttpResponse.json(attachment, { status: 201 })
        },
      ),
    )

    await expect(
      service.uploadAttachment(documentId, new File(['x'], 'note.txt'), 'Supporting', 1),
    ).resolves.toEqual(attachment)
  })

  it('deletes an attachment with the rowVersion query parameter and resolves on 204', async () => {
    const { service } = setupService()
    const requested = vi.fn()

    server.use(
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        ({ request }) => {
          requested({ url: new URL(request.url), attachmentId: ATTACHMENT_ID })
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(service.deleteAttachment(DOCUMENT_ID, ATTACHMENT_ID, 7)).resolves.toBeUndefined()

    expect(requested).toHaveBeenCalledOnce()
    const { url } = requested.mock.calls[0]?.[0] as unknown as { url: URL }
    expect(url.searchParams.get('rowVersion')).toBe('7')
  })

  it('rejects a forbidden delete with the Arabic 403 envelope', async () => {
    const { service } = setupService()

    server.use(
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        () =>
          HttpResponse.json(
            {
              code: 'document.attachment_delete_not_allowed',
              status: 403,
              titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
              detailAr: 'لا يمكن حذف المرفقات إلا من مستند غير مُرصد بعد (مسودة).',
              traceId: 'fixture-trace-id',
            },
            { status: 403 },
          ),
      ),
    )

    const error = await service
      .deleteAttachment(DOCUMENT_ID, ATTACHMENT_ID, 1)
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 403,
      code: 'document.attachment_delete_not_allowed',
    })
  })

  it('rejects a stale-rowVersion delete with the Arabic 409 envelope', async () => {
    const { service } = setupService()

    server.use(
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        () =>
          HttpResponse.json(
            {
              code: 'document.version_conflict',
              currentRowVersion: 5,
              currentStatus: 'Draft',
              policy: { documentId: DOCUMENT_ID },
              status: 409,
              titleAr: 'تغيرت البيانات. حدّث الصفحة ثم حاول مجدداً.',
              detailAr: 'تعذر تنفيذ الإجراء: المستند عدَّله مستخدم آخر.',
              traceId: 'fixture-trace-id',
            },
            { status: 409 },
          ),
      ),
    )

    const error = await service
      .deleteAttachment(DOCUMENT_ID, ATTACHMENT_ID, 1)
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 409,
      code: 'document.version_conflict',
    })
  })
})
