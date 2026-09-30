import { describe, expect, it } from 'vitest'

import { applicationSourceFiles, readSource, relativeToRepo } from './support/source-scan'

/**
 * D-ORG-01 — the same-origin browser contract is not configurable.
 *
 * The API denies every origin and refuses to start if an origin allowlist is
 * configured. See `docs/same-origin-browser-contract-decision.md`.
 *
 * The backend enforces its half and the dev proxy satisfies its half. This test
 * guards the half that lives in THIS repository and was previously unenforced:
 * the frontend must never emit an origin grant, and must never grow a setting
 * that looks like one. Without it, the next person to "fix" a browser CORS
 * error by adding `Access-Control-Allow-Origin` to an Axios interceptor would
 * break the credentialed-cookie contract the backend's startup guard exists to
 * protect — and would break it quietly, because a response the browser can
 * already reach is hard to notice being wrongly widened.
 */

/** Any sign that the frontend is granting or configuring a browser origin. */
const ORIGIN_GRANT =
  /access-control-allow-origin|allowanyorigin|withcredentials\s*:\s*false|VITE_[A-Z0-9_]*ORIGIN[A-Z0-9_]*/iu

/**
 * Hosts that are provably not real backends, so a literal naming one leaks
 * nothing. RFC 2606 reserves these TLDs precisely so they can never resolve,
 * and RFC 7807 requires a problem `type` to identify a type rather than to be
 * dereferenced.
 */
const RESERVED_TLDS = new Set(['localhost', 'test', 'example', 'invalid'])

/** Absolute `http(s)://` literals in `source` whose host could resolve. */
function leakedBackendOrigins(source: string): string[] {
  const urls = source.match(/https?:\/\/[^\s'"`)]+/gu) ?? []

  return urls.filter((url) => {
    let host: string
    try {
      host = new URL(url).hostname.toLowerCase()
    } catch {
      // A malformed URL is not a leak; the resolver rejects it.
      return false
    }
    return !RESERVED_TLDS.has(host.split('.').pop() ?? '')
  })
}

describe('same-origin browser contract (D-ORIG-01)', () => {
  const sourceFiles = applicationSourceFiles()

  it('scans the application source the contract governs', () => {
    // A deliberately different device from the exact-count assertion the
    // composition-standard scans use. An exact count over all application
    // source would fail on every file anyone adds, which trains the next
    // person to bump the number without looking — the very failure the count
    // exists to prevent. A floor still catches a collapsed or broken glob, and
    // the membership assertion catches a narrowed one, which is the case that
    // matters for this contract.
    expect(sourceFiles.length).toBeGreaterThan(200)
    expect(sourceFiles.map(relativeToRepo)).toEqual(
      expect.arrayContaining([
        'src/config/vite-dev-server.ts',
        'src/config/env.ts',
        'src/shared/services/api.client.ts',
      ]),
    )
  })

  it('never emits an origin grant or grows an origin-allowlist setting', () => {
    const offenders = sourceFiles
      .filter((file) => ORIGIN_GRANT.test(readSource(file)))
      .map(relativeToRepo)

    expect(offenders).toEqual([])
  })

  it('keeps a real backend host out of the browser bundle', () => {
    const leaks = sourceFiles.flatMap((file) =>
      leakedBackendOrigins(readSource(file)).map((url) => `${relativeToRepo(file)}: ${url}`),
    )

    expect(leaks).toEqual([])
  })

  it('keeps the decision that justifies the guard', () => {
    // The prose is the reason the prohibition exists. If the decision is
    // deleted the guard becomes unexplained, so its presence is asserted.
    const decision = readSource('docs/same-origin-browser-contract-decision.md')

    expect(decision).toContain('same-origin')
    expect(decision).toContain('not configurable')
  })

  describe('negative control', () => {
    // A guard that has never failed proves nothing. Each rule runs a
    // known-bad snippet through the SAME predicate the real scan uses, so the
    // control cannot drift from the implementation the way a simplified copy
    // did in the composition-standard scans.
    it.each([
      [
        'an Axios interceptor setting the header',
        `res.setHeader('Access-Control-Allow-Origin', '*')`,
      ],
      ['a literal wildcard origin', `const origin = 'AllowAnyOrigin'`],
      ['credentials disabled to dodge CORS', `axios.create({ withCredentials: false })`],
      ['an origin allowlist environment variable', `VITE_ALLOWED_ORIGINS=localhost:5173`],
    ])('detects %s', (_label, snippet) => {
      expect(ORIGIN_GRANT.test(snippet)).toBe(true)
    })

    it.each([
      [
        'an RFC 2606 unresolvable base for path parsing',
        `new URL(url, 'http://eiams.invalid').pathname`,
      ],
      ['an RFC 7807 problem type', `type: 'https://eiams.example/problems/record.not_found'`],
      ['a test-domain host', `const u = 'https://api.eiams.test/v1'`],
      ['the server-only dev proxy target', `EIAMS_DEV_PROXY_TARGET=http://localhost:5000`],
      [
        'the documented default target',
        `const DEFAULT_DEV_API_PROXY_TARGET = 'http://localhost:5000'`,
      ],
    ])('does not flag %s', (_label, snippet) => {
      expect(ORIGIN_GRANT.test(snippet)).toBe(false)
      expect(leakedBackendOrigins(snippet)).toEqual([])
    })

    it('flags a real backend host that would ship to the browser', () => {
      expect(leakedBackendOrigins(`const api = 'https://api.eiams-internal.corp/api/v1'`)).toEqual([
        'https://api.eiams-internal.corp/api/v1',
      ])
    })
  })
})
