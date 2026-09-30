import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { apiClient } from '@/shared/services/api.client'
import type { DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import { readRequestForm } from '@/test/msw/multipart-parser'
import { errJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

// jsdom's XHR serializer preserves File names; undici's fetch adapter drops
// them to "blob" and asserts on non-undici Files (see multipart-parser.ts).
apiClient.defaults.adapter = 'xhr'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDocumentAttachmentManager } from './use-document-attachments'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(150)
const SIGNED_ATTACHMENT_ID = fixtureUuid(170)

function signedAttachment(): DocumentAttachment {
  return {
    attachmentId: SIGNED_ATTACHMENT_ID,
    attachmentType: 'SignedOriginal',
    checksum: 'sha256:fixture',
    documentId: DOCUMENT_ID,
    downloadUrl: null,
    fileSize: 4,
    mimeType: 'application/pdf',
    originalFilename: 'signed.pdf',
    uploadedAt: '2026-08-12T09:00:00.000Z',
    uploadedBy: { id: fixtureUuid(10), displayName: 'مستخدم تجريبي' },
  }
}

function makeDraftDocument(attachments: readonly DocumentAttachment[] = []) {
  return createWarehouseDocument({
    documentId: DOCUMENT_ID,
    documentStatus: 'Draft',
    rowVersion: 1,
    attachments,
  })
}

function makePostedDocument() {
  return createWarehouseDocument({
    documentId: DOCUMENT_ID,
    documentStatus: 'Posted',
    rowVersion: 2,
    attachments: [signedAttachment()],
  })
}

function makeFile(name: string, type = 'application/pdf') {
  return new File([new Uint8Array(4)], name, { type })
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useDocumentAttachmentManager', () => {
  it('uploads: drops the pending entry by file identity and refetches the detail', async () => {
    const store = { document: makeDraftDocument() }
    let detailRequests = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.document)
      }),
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`,
        async ({ request }) => {
          const form = await readRequestForm(request)
          expect(form.get('attachmentType')).toBe('SignedOriginal')
          store.document = makeDraftDocument([signedAttachment()])
          return HttpResponse.json(store.document.attachments[0], { status: 201 })
        },
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.readOnly).toBe(false))
    const before = detailRequests

    const file = makeFile('signed.pdf')
    act(() => result.current.onUpload([file], 'SignedOriginal'))

    await waitFor(() => expect(result.current.pendingUploads).toHaveLength(0))
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    expect(result.current.attachments[0]?.attachmentId).toBe(SIGNED_ATTACHMENT_ID)
    expect(detailRequests).toBe(before + 1)
    expect(result.current.uploadError).toBeNull()
  })

  it('keeps the pending entry failed and surfaces the Arabic upload error', async () => {
    const store = { document: makeDraftDocument() }
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(store.document),
      ),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, () =>
        errJson(413, {
          code: 'DOCUMENT_ATTACHMENTS_FILE_TOO_LARGE',
          message: 'The uploaded file exceeds the allowed size.',
        }),
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.readOnly).toBe(false))

    const file = makeFile('big.pdf')
    act(() => result.current.onUpload([file], 'Supporting'))

    await waitFor(() => expect(result.current.pendingUploads[0]?.failed).toBe(true))
    expect(result.current.pendingUploads[0]?.file).toBe(file)
    expect(result.current.uploadError).toBe('حجم الملف يتجاوز الحد المسموح.')
    expect(result.current.attachments).toHaveLength(0)
  })

  it('reuses the failed pending entry on retry and succeeds without duplicates', async () => {
    const store = { document: makeDraftDocument() }
    let uploadCalls = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(store.document),
      ),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, async () => {
        uploadCalls += 1
        if (uploadCalls === 1) {
          return errJson(422, {
            code: 'DOCUMENT_ATTACHMENTS_STORAGE_FAILURE',
            message: 'The file could not be stored.',
          })
        }
        store.document = makeDraftDocument([signedAttachment()])
        return HttpResponse.json(store.document.attachments[0], { status: 201 })
      }),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.readOnly).toBe(false))

    const file = makeFile('signed.pdf')
    act(() => result.current.onUpload([file], 'SignedOriginal'))
    await waitFor(() => expect(result.current.pendingUploads[0]?.failed).toBe(true))
    expect(result.current.pendingUploads).toHaveLength(1)

    act(() => result.current.onUpload([file], 'SignedOriginal'))
    expect(result.current.pendingUploads).toHaveLength(1)

    await waitFor(() => expect(result.current.pendingUploads).toHaveLength(0))
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    expect(uploadCalls).toBe(2)
  })

  it('sends the loaded document rowVersion on remove and refetches the detail', async () => {
    const store = { document: makeDraftDocument([signedAttachment()]) }
    let detailRequests = 0
    let deletedRowVersion: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.document)
      }),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/:attachmentId`,
        ({ request }) => {
          deletedRowVersion = new URL(request.url).searchParams.get('rowVersion')
          store.document = makeDraftDocument([])
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    const before = detailRequests

    act(() => result.current.onRemove(result.current.attachments[0]!))

    await waitFor(() => expect(result.current.attachments).toHaveLength(0))
    expect(deletedRowVersion).toBe('1')
    expect(detailRequests).toBe(before + 1)
    expect(result.current.deleteError).toBeNull()
  })

  it('marks the manager readOnly outside Draft and blocks uploads and removes', async () => {
    const store = { document: makePostedDocument() }
    let posts = 0
    let deletes = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(store.document),
      ),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, () => {
        posts += 1
        return HttpResponse.json(signedAttachment(), { status: 201 })
      }),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/:attachmentId`,
        () => {
          deletes += 1
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.disabled).toBe(false))
    expect(result.current.readOnly).toBe(true)
    expect(result.current.attachments).toHaveLength(1)

    act(() => result.current.onUpload([makeFile('note.pdf')], 'Supporting'))
    act(() => result.current.onRemove(result.current.attachments[0]!))

    expect(result.current.pendingUploads).toHaveLength(0)
    expect(posts).toBe(0)
    expect(deletes).toBe(0)
  })

  // e24-t10 / B2: the manager used to keep only `titleAr` and never refetched
  // on a 409. It now keeps the server's `detailAr` and, on a conflict only,
  // invalidates the scoped detail branch so the panel stops describing a
  // document the server has already changed.
  it('exposes the server Arabic detail on a 409, keeps the attachment, and refetches the detail', async () => {
    const store = { document: makeDraftDocument([signedAttachment()]) }
    let detailRequests = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.document)
      }),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/:attachmentId`,
        ({ request }) => {
          expect(new URL(request.url).searchParams.get('rowVersion')).toBe('1')
          return errJson(409, {
            code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
            message: 'The document row version did not match.',
            details: {
              currentRowVersion: 1,
              currentStatus: 'Draft',
              policy: store.document.policy,
            },
          })
        },
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    const before = detailRequests

    act(() => result.current.onRemove(result.current.attachments[0]!))

    await waitFor(() =>
      expect(result.current.deleteError).toBe(
        'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
      ),
    )
    expect(result.current.attachments).toHaveLength(1)
    // D-LIFE-01 rule 6: the cached document was stale, so it is refetched.
    await waitFor(() => expect(detailRequests).toBeGreaterThan(before))
  })

  it('falls back to the problem title when the failure carries no Arabic detail', async () => {
    const store = { document: makeDraftDocument([signedAttachment()]) }
    let detailRequests = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(store.document)
      }),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/:attachmentId`,
        () =>
          HttpResponse.json(
            {
              code: 'attachment.forbidden',
              status: 403,
              titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
              detailAr: null,
              traceId: 'fixture-trace-id',
            },
            { status: 403 },
          ),
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    const before = detailRequests

    act(() => result.current.onRemove(result.current.attachments[0]!))

    await waitFor(() =>
      expect(result.current.deleteError).toBe('لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.'),
    )
    // A 403 says nothing about document freshness, so it must not refetch.
    expect(detailRequests).toBe(before)
  })

  it('surfaces the server Arabic detail of a failed upload, not the generic title', async () => {
    const store = { document: makeDraftDocument() }
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(store.document),
      ),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, () =>
        errJson(409, {
          code: 'DOCUMENT_ATTACHMENTS_SIGNED_ORIGINAL_ALREADY_EXISTS',
          message: 'A signed original already exists for this document.',
        }),
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.readOnly).toBe(false))

    act(() => result.current.onUpload([makeFile('signed.pdf')], 'SignedOriginal'))

    await waitFor(() => expect(result.current.uploadError).not.toBeNull())
    expect(result.current.uploadError).toBe('أرشف النسخة الموقعة الحالية ثم أعد المحاولة.')
  })

  it('renders a zero-network manager for a null documentId', async () => {
    let detailRequests = 0
    let posts = 0
    let deletes = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(makeDraftDocument())
      }),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments`, () => {
        posts += 1
        return HttpResponse.json(signedAttachment(), { status: 201 })
      }),
      http.delete(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/attachments/:attachmentId`,
        () => {
          deletes += 1
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const { result } = renderHook(() => useDocumentAttachmentManager(null), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.readOnly).toBe(true))
    act(() => result.current.onUpload([makeFile('note.pdf')], 'Supporting'))
    act(() => result.current.onCancelPending(makeFile('note.pdf')))
    act(() => result.current.onRemove(signedAttachment()))

    expect(result.current.attachments).toHaveLength(0)
    expect(result.current.pendingUploads).toHaveLength(0)
    expect(result.current.isUploading).toBe(false)
    expect(detailRequests).toBe(0)
    expect(posts).toBe(0)
    expect(deletes).toBe(0)
  })
})
