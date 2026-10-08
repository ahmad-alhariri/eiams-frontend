import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Fixtures must speak the envelope the API actually sends.
 *
 * THE DEFECT THIS GUARDS. `src/test/msw/envelope.ts` exists precisely so a
 * fixture cannot express the old bare-payload shape by accident, and its header
 * records that "every MSW handler in this repository used to return a bare
 * payload — `HttpResponse.json([permission])` — which is what the provisional
 * OpenAPI snapshot described and NOT what the API sends. That let the whole
 * service layer be wrong about the wire without a single test noticing."
 *
 * The helpers being AVAILABLE is not the same as them being USED. Two handlers
 * had already drifted back to raw shapes while the helpers sat beside them:
 *
 *   - `rbac-scope-isolation.test.ts` answered 403 with `{message:'forbidden'}`.
 *     The API sends `{success:false,error:{code,...}}`, so `normalizeApiError`
 *     found no `error.code` and fell back to the per-status string. The test
 *     asserted only `status: 403`, so it passed while proving nothing about
 *     which Arabic copy a scope refusal produces.
 *
 *   - `app-router.test.tsx` answered `/auth/session` with a bare session
 *     object. `auth.service.ts` reads that through `ApiTransport.request`,
 *     which unwraps `response.data.data`, so the payload arrived `undefined`.
 *     It passed because the test seeded the query cache directly and the fetch
 *     never mattered.
 *
 * Both are the same class as the removed `problemFromPayload`: a shape the
 * application's own parser cannot read, behind a passing assertion.
 *
 * SCOPE, AND WHY IT IS THIS NARROW. The first version of this guard banned
 * `HttpResponse.json`, `HttpResponse.text` and `new HttpResponse` as a returned
 * handler value, and immediately flagged 14 sites. Reading each one showed they
 * are not one defect:
 *
 *   - Nine are `new HttpResponse(null, { status: 500 })` — an EMPTY body used to
 *     force an error path. There is no body to get wrong, and the status is
 *     exactly what the application branches on. Legitimate.
 *   - `HttpResponse.text('<!doctype html>')` in `transport-failure.test.ts` is a
 *     real wire shape, used on purpose to exercise the non-JSON guard.
 *   - The rest were `HttpResponse.json(createPage([...]))` — a UI page shape the
 *     transport cannot read. That IS the defect.
 *
 * So the rule is stated as it can be defended: a fixture must not return a bare
 * payload or a hand-built body. An empty-body status stub is exempt, because it
 * carries nothing for the application to misparse. A rule that bans all three
 * shapes would have been disabled at first review, and a disabled guard protects
 * nothing.
 */

const SRC_ROOT = join(process.cwd(), 'src')

/** Files that legitimately contain the banned shapes. */
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  'src/shared/api/error-envelope.ts', // builds the envelope; uses `new Response`.
  'src/test/msw/envelope.ts', // the helpers themselves.
  'src/test/msw/server.test.ts', // asserts the harness, not an endpoint.
  'src/test/fixture-envelope-discipline.test.ts', // this file.
])

const SCAN_EXTENSIONS = /\.[jt]sx?$/u
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'generated'])

function walk(directory: string, accumulator: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue
    }
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, accumulator)
    } else if (entry.isFile() && SCAN_EXTENSIONS.test(entry.name)) {
      accumulator.push(fullPath)
    }
  }
}

function repoRelative(file: string): string {
  return relative(process.cwd(), file).split(sep).join('/')
}

/**
 * Strips comments, so prose describing a bad pattern cannot fail the scan. The
 * non-vacuity fixtures below quote the bad patterns verbatim and would otherwise
 * trip the rule against themselves.
 */
function codeOnly(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .split(/\r?\n/u)
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/u.test(line))
    .join('\n')
}

interface Offender {
  readonly file: string
  readonly line: number
  readonly shape: string
}

/**
 * `HttpResponse.json(x)` or `new HttpResponse(x, …)` where `x` is NOT null —
 * i.e. a body the application will try to parse. The exemption for a `null`
 * body is the whole scope decision this guard makes.
 */
const RETURNED_BODY_RESPONSE =
  /(?:HttpResponse\.json|new\s+HttpResponse)\(\s*(?!null\s*[,)])[\s\S]{0,400}?\)\s*[),]?\s*$/u

function findOffenders(file: string): Offender[] {
  const relativePath = repoRelative(file)
  if (ALLOWED_FILES.has(relativePath)) {
    return []
  }

  const lines = codeOnly(readFileSync(file, 'utf8')).split(/\r?\n/u)
  const found: Offender[] = []

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    // Only a RETURNED response is a fixture answer; a `HttpResponse.json` used to
    // build a request body, or a mock bound to a variable, is not the defect.
    if (!trimmed.startsWith('=>') && !trimmed.startsWith('return')) {
      continue
    }
    for (const shape of ['HttpResponse.json', 'new HttpResponse']) {
      if (trimmed.includes(shape) && RETURNED_BODY_RESPONSE.test(trimmed)) {
        found.push({ file: relativePath, line: index + 1, shape })
      }
    }
  }

  return found
}

const ALL_SOURCE_FILES: string[] = []
walk(SRC_ROOT, ALL_SOURCE_FILES)

const OFFENDERS = ALL_SOURCE_FILES.flatMap(findOffenders)

describe('fixture envelope discipline (MSW speaks the real wire)', () => {
  it('scans a pinned set of files', () => {
    // Pinned rather than `> 0`: a narrowed glob leaves a few files rather than
    // none, and every "no offenders" assertion below would then pass silently
    // while testing nothing.
    expect(ALL_SOURCE_FILES.length).toBeGreaterThanOrEqual(600)
    expect(OFFENDERS).toEqual([])
  })

  it('registers no MSW handler returning a bare payload or hand-built body', () => {
    if (OFFENDERS.length > 0) {
      throw new Error(
        'Fixture returns a body the API does not send:\n  ' +
          OFFENDERS.map((o) => `${o.file}:${o.line} (${o.shape})`).join('\n  ') +
          '\n\nUse `okJson` / `okPageJson` for a success envelope, `errJson` for ' +
          'the nested error envelope, and `apiJson` when the shape varies by status. ' +
          'A bare payload arrives `undefined` under `ApiTransport.request` and gives ' +
          '`normalizeApiError` no `error.code` to read. `createPage()` from factories ' +
          'is a UI page ({items, meta}), NOT a wire page — use `okPageJson`.',
      )
    }
    expect(OFFENDERS).toEqual([])
  })

  it('would catch the two shapes that had already drifted (non-vacuity)', () => {
    // The defect, reconstructed verbatim. A guard that cannot reproduce the bug
    // it was written for is decoration.
    const drifted = [
      `      http.get('/api/v1/inventory/balances', () => HttpResponse.json({ message: 'forbidden' }, { status: 403 }))`,
      `      http.get(\`\${API_BASE_URL}/auth/session\`, () => HttpResponse.json(authenticatedSession()))`,
      `        return HttpResponse.json(createPage([transferDocument]))`,
      `      http.get(\`\${API_BASE_URL}/warehouses\`, () => HttpResponse.json(createPage([])))`,
    ]

    for (const line of drifted) {
      const body = line.slice(line.indexOf('=>') + 2).trim()
      expect(RETURNED_BODY_RESPONSE.test(body), line).toBe(true)
    }
  })

  it('does not flag the shapes that are legitimate', () => {
    // Over-broad rules get disabled, so the false-positive boundary is asserted
    // explicitly rather than left to be discovered in review. These are the four
    // shapes the first, over-broad version of this guard wrongly flagged.
    const legitimate = [
      // Empty body + status: nothing for the application to misparse.
      `        () => new HttpResponse(null, { status: 500 }),`,
      `        () => new HttpResponse(null, { status: 204 }),`,
      // A non-JSON body is a real wire shape, used to exercise the 502 guard.
      `      http.get(\`\${API_BASE_URL}/inventory/balances\`, () => HttpResponse.text('<!doctype html>'))`,
      // Helper call sites: not a raw construction at all.
      `      http.get(\`\${API_BASE_URL}/warehouses\`, () => okPageJson([warehouse]))`,
      `      http.get(\`\${API_BASE_URL}/audit-logs/:id\`, () => errJson(404, { code: 'AUDIT_LOGS_NOT_FOUND' }))`,
    ]

    for (const line of legitimate) {
      const body = line.slice(line.indexOf('=>') + 2).trim()
      expect(RETURNED_BODY_RESPONSE.test(body), line).toBe(false)
    }
  })
})
