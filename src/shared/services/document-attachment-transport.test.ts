import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  createDocumentAttachmentFormData,
  createDocumentAttachmentTransport,
} from '@/shared/services/document-attachment-transport'
import type { DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { okJson } from '@/test/msw/envelope'
import { readRequestForm } from '@/test/msw/multipart-parser'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

beforeAll(() => {
  // jsdom's XHR serializer preserves File names; undici's fetch adapter drops
  // them to "blob" and asserts on non-undici Files (see multipart-parser.ts).
  axios.defaults.adapter = 'xhr'
})

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

// A real transport over a real Axios client (3abe). The harness now serves the
// wire envelope, which is what the transport reads.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupTransport() {
  const { transport } = createHarness()
  return createDocumentAttachmentTransport(transport)
}

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
        okJson([attachmentFixture]),
      ),
    )

    await expect(transport.list(DOCUMENT_ID)).resolves.toEqual([attachmentFixture])
  })

  it('uploads a transient file as the contract multipart payload', async () => {
    const transport = setupTransport()
    const file = new File(['signed copy'], 'signed.pdf', { type: 'application/pdf' })
    let capturedForm: FormData | undefined
    let capturedPath: string | undefined

    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`,
        async ({ request }) => {
          capturedPath = new URL(request.url).pathname
          capturedForm = await readRequestForm(request)
          return okJson(attachmentFixture)
        },
      ),
    )

    await expect(
      transport.upload(DOCUMENT_ID, { attachmentType: 'SignedOriginal', file, rowVersion: 7 }),
    ).resolves.toEqual(attachmentFixture)

    // Read the REAL transmitted form off the intercepted request rather than
    // asserting a mock's call arguments. The previous version passed
    // `{ post } as unknown as AxiosInstance` and asserted that `client.post` had
    // been called with `(path, body, undefined)` — which verified a mock's shape,
    // not the request, and broke the moment the service moved onto the transport.
    // The multipart assertions are unchanged in substance.
    expect(capturedPath).toBe(`/api/v1/warehouse-documents/${DOCUMENT_ID}/attachments`)
    expect(capturedForm).toBeInstanceOf(FormData)
    expect(capturedForm?.get('attachmentType')).toBe('SignedOriginal')
    expect(capturedForm?.get('rowVersion')).toBe('7')
    expect(capturedForm?.get('file')).toBeInstanceOf(File)
    // No caller-supplied Content-Type: the browser/Axios sets the multipart
    // boundary when it transmits this transient form data.
    expect(capturedForm?.get('content-type')).toBeNull()
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
