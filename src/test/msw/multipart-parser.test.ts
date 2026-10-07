import { describe, expect, it, vi } from 'vitest'

import { parseMultipartText, readRequestForm } from '@/test/msw/multipart-parser'

/**
 * The browser-first multipart branch (EPIC G7, bead `eiams-frontend-79na`).
 *
 * `readRequestForm` is the one place that decides how a request body becomes a
 * `FormData`, and its two branches have genuinely different jobs:
 *
 *   native   — `request.formData()`, i.e. what a browser really does, used for
 *              dev mode against the MSW browser worker. It yields real file
 *              names and real bytes, which is the whole point of keeping it
 *              first rather than always parsing text.
 *   fallback — `parseMultipartText`, needed only where the native extractor
 *              cannot run. In the vitest jsdom realm it ALWAYS throws
 *              `ERR_ASSERTION` on a multipart body (undici's webidl check
 *              against the jsdom `File`), which is why
 *              `document-attachment-service.test.ts` asserts the degraded
 *              `name: 'blob'` it sees here.
 *
 * Both branches therefore have to be covered, and the non-vacuity problem is
 * specific: the native branch cannot be exercised with a MULTIPART body in this
 * realm at all, so a test that only ever sees the fallback proves nothing about
 * the ordering. The ordering is asserted directly instead — the native case
 * proves `text()` is never read, and the fallback case proves `formData()` is
 * tried first and its failure is what selects the parser.
 */

const UPLOAD_URL = 'http://localhost/api/v1/warehouse-documents/doc-1/attachments'

function multipartUploadRequest(): Request {
  const form = new FormData()
  form.append('attachmentType', 'SignedOriginal')
  form.append('rowVersion', '3')
  form.append('file', new File(['PDFBYTES'], 'signed.pdf', { type: 'application/pdf' }))
  return new Request(UPLOAD_URL, { method: 'POST', body: form })
}

describe('readRequestForm fallback branch (jsdom, native multipart unavailable)', () => {
  it('parses the multipart body with parseMultipartText when the native extractor throws', async () => {
    const request = multipartUploadRequest()
    const native = vi.spyOn(request, 'formData')

    const form = await readRequestForm(request)

    // The native call is attempted first; in this realm it rejects, and that
    // rejection is the only thing that selects the fallback. Proved on a fresh
    // request, because the one above has already had its body consumed.
    expect(native).toHaveBeenCalledOnce()
    await expect(multipartUploadRequest().formData()).rejects.toThrow()

    expect([...form.keys()]).toEqual(['attachmentType', 'rowVersion', 'file'])
    expect(form.get('attachmentType')).toBe('SignedOriginal')
    expect(form.get('rowVersion')).toBe('3')
    // The parser's only job beyond field names is name/type/size fidelity; it
    // never stores the bytes (see the module header). `name: 'blob'` is what the
    // vitest transport leaves behind for a jsdom File — the browser branch, which
    // runs first where it works, keeps the real name.
    expect(form.get('file')).toMatchObject({ name: 'blob', type: 'application/pdf' })
  })

  it('produces exactly what parseMultipartText produces for the same bytes', async () => {
    const request = multipartUploadRequest()
    const text = await request.clone().text()

    const read = await readRequestForm(request)
    const direct = parseMultipartText(text, request.headers.get('content-type'))

    expect([...read.entries()]).toEqual([...direct.entries()])
  })

  it('refuses a multipart body with no boundary instead of returning an empty form', () => {
    // A silent empty FormData would read as "no file attached" and produce a
    // 422 about a missing attachment — a different defect from the one that
    // happened. The parser must fail loudly.
    expect(() => parseMultipartText('--x\r\nnope', 'multipart/form-data')).toThrow(
      /missing multipart boundary/u,
    )
  })
})

describe('readRequestForm native branch', () => {
  it('returns the native formData result and never reads the body as text', async () => {
    // A urlencoded body is used here, and deliberately: it is the one request
    // shape whose native parse succeeds in this realm (no File is constructed,
    // so the jsdom/undici assertion never fires). It still exercises exactly
    // what the browser branch is responsible for — native parse first, no text
    // fallback — and the urlencoded content type is one `parseMultipartText`
    // cannot handle at all, which is what makes the next assertion decisive.
    const request = new Request(UPLOAD_URL, {
      method: 'POST',
      body: 'attachmentType=Supporting&rowVersion=4',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const native = vi.spyOn(request, 'formData')
    const text = vi.spyOn(request, 'text')

    const form = await readRequestForm(request)

    expect([...form.keys()]).toEqual(['attachmentType', 'rowVersion'])
    expect(form.get('attachmentType')).toBe('Supporting')
    expect(form.get('rowVersion')).toBe('4')
    expect(native).toHaveBeenCalledOnce()
    // The body is never read as text on this branch, which is the whole point
    // of trying the native extractor first: the parser loses the bytes.
    expect(text).not.toHaveBeenCalled()
    // Non-vacuity for this branch: the fallback cannot parse this content type,
    // so if the implementation reached for it — first, or after the native call
    // instead of returning its result — this throws instead of returning a form.
    expect(() =>
      parseMultipartText(
        'attachmentType=Supporting&rowVersion=4',
        request.headers.get('content-type'),
      ),
    ).toThrow(/missing multipart boundary/u)
  })
})
