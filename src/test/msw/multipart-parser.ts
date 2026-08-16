/**
 * Minimal, dependency-free `multipart/form-data` text parser.
 *
 * Why this exists: undici's `Request.formData()` (Node's fetch stack) asserts
 * on `webidl.is.File(value)` using the *global* `File` constructor. In the
 * vitest jsdom realm the global `File` belongs to jsdom, so multipart parsing
 * of ANY intercepted request throws `ERR_ASSERTION` (this also swallowed the
 * axios fetch adapter path: undici refused the jsdom `File` in the body).
 * Browsers are unaffected — the dev mock tries `request.formData()` first and
 * only falls back to this parser, which is why it keeps real browser parity.
 *
 * The parser honours the https://andreubotella.github.io/multipart-form-data/
 * wire shape (boundary, CRLF framing, `Content-Disposition` fields) and only
 * needs name/type/size fidelity — the mock never stores the file bytes.
 */
const BOUNDARY_PATTERN = /boundary="?([^";]+)"?/iu
const HEADER_SEPARATOR = '\r\n\r\n'

function extractBoundary(contentType: string | null): string | null {
  const match = contentType === null ? null : contentType.match(BOUNDARY_PATTERN)
  return match === null ? null : (match[1] ?? null)
}

function partName(headerBlock: string): string | null {
  return headerBlock.match(/name="([^"]*)"/u)?.[1] ?? null
}

function partFilename(headerBlock: string): string | null {
  return headerBlock.match(/filename="([^"]*)"/u)?.[1] ?? null
}

function partType(headerBlock: string): string | null {
  return headerBlock.match(/\r?\nContent-Type:\s*([^\r\n]+)/iu)?.[1]?.trim() ?? null
}

/** Parses the raw multipart text into a fresh `FormData` (jsdom realm types). */
export function parseMultipartText(text: string, contentType: string | null): FormData {
  const boundary = extractBoundary(contentType)
  if (boundary === null) {
    throw new Error(`parseMultipartText: missing multipart boundary in "${contentType ?? ''}"`)
  }

  const form = new FormData()
  const segments = text.split(`--${boundary}`)
  for (const segment of segments) {
    const body = segment.replace(/^\r\n/u, '').replace(/\r\n$/u, '')
    if (body === '' && segment.endsWith('--')) {
      continue
    }
    const separatorIndex = body.indexOf(HEADER_SEPARATOR)
    if (separatorIndex === -1) {
      continue
    }
    const headerBlock = body.slice(0, separatorIndex)
    const value = body.slice(separatorIndex + HEADER_SEPARATOR.length)

    const name = partName(headerBlock)
    if (name === null) {
      continue
    }

    const filename = partFilename(headerBlock)
    if (filename !== null) {
      form.append(
        name,
        new File([value], filename, {
          type: partType(headerBlock) ?? 'application/octet-stream',
        }),
      )
    } else {
      form.append(name, value)
    }
  }
  return form
}

/**
 * Reads a request form the way the dev mock needs it: native browser parsing
 * first, with this parser as the fallback for environments where undici's
 * multipart extractor cannot operate (vitest jsdom).
 */
export async function readRequestForm(request: Request): Promise<FormData> {
  const fallback = request.clone()
  try {
    return await request.formData()
  } catch {
    return parseMultipartText(await fallback.text(), request.headers.get('content-type'))
  }
}
