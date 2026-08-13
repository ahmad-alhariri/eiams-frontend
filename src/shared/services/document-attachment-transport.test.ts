import { HttpResponse, http } from 'msw'
import type { AxiosInstance } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDocumentAttachmentFormData,
  createDocumentAttachmentTransport,
} from '@/shared/services/document-attachment-transport'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001'
const ATTACHMENT_ID = '20000000-0000-4000-8000-000000000001'

const attachmentFixture: DocumentAttachment = {
  attachmentId: ATTACHMENT_ID,
  attachmentType: 'SignedOriginal',
  checksum: 'server-owned-checksum',
  documentId: DOCUMENT_ID,
  downloadUrl: 'https://downloads.example.test/attachment',
  fileSize: 12,
  mimeType: 'application/pdf',
  originalFilename: 'signed.pdf',
  uploadedAt: '2026-08-12T09:00:00.000Z',
  uploadedBy: {
    id: '30000000-0000-4000-8000-000000000001',
    displayName: 'أمين المستودع',
  },
}

const bundles: ApiClientBundle[] = []

function setupTransport() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createDocumentAttachmentTransport(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('document attachment transport', () => {
  it('encodes only the contract multipart fields and leaves the browser to add its boundary', () => {
    const file = new File(['signed copy'], 'signed.pdf', { type: 'application/pdf' })
    const formData = createDocumentAttachmentFormData({
      attachmentType: 'SignedOriginal',
      file,
      rowVersion: 7,
    })

    expect([...formData.keys()]).toEqual(['attachmentType', 'file', 'rowVersion'])
    expect(formData.get('attachmentType')).toBe('SignedOriginal')
    expect(formData.get('file')).toBe(file)
    expect(formData.get('rowVersion')).toBe('7')
  })

  it('lists the server projection without constructing a download URL', async () => {
    const transport = setupTransport()
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, () =>
        HttpResponse.json([attachmentFixture]),
      ),
    )

    await expect(transport.list(DOCUMENT_ID)).resolves.toEqual([attachmentFixture])
  })

  it('uploads a transient file as the contract multipart payload', async () => {
    const file = new File(['signed copy'], 'signed.pdf', { type: 'application/pdf' })
    const post = vi.fn().mockResolvedValue({ data: attachmentFixture })
    const transport = createDocumentAttachmentTransport({ post } as unknown as AxiosInstance)

    await expect(
      transport.upload(DOCUMENT_ID, { attachmentType: 'SignedOriginal', file, rowVersion: 7 }),
    ).resolves.toEqual(attachmentFixture)

    expect(post).toHaveBeenCalledOnce()
    const [path, body, config] = post.mock.calls[0] ?? []
    expect(path).toBe(`/warehouse-documents/${DOCUMENT_ID}/attachments`)
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('attachmentType')).toBe('SignedOriginal')
    expect((body as FormData).get('rowVersion')).toBe('7')
    // No caller-supplied Content-Type: the browser/Axios sets the multipart
    // boundary when it transmits this transient form data.
    expect(config).toBeUndefined()
  })

  it('deletes only through the draft attachment endpoint with its row version', async () => {
    const transport = setupTransport()
    server.use(
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/${ATTACHMENT_ID}`,
        ({ request }) => {
          expect(new URL(request.url).searchParams.get('rowVersion')).toBe('7')
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await expect(
      transport.delete(DOCUMENT_ID, { attachmentId: ATTACHMENT_ID, rowVersion: 7 }),
    ).resolves.toBeUndefined()
  })
})
