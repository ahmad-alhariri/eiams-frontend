import compositionStandard from '../../docs/feature-service-composition-standard.md?raw'
import { describe, expect, it } from 'vitest'

/**
 * The machine-enforced half of the standard lives in two places now:
 *
 *  - `eslint.config.js` — the service-purity rules, which are single-token
 *    restrictions ESLint can express, reported with a file and line at `lint`
 *    time, before the build;
 *  - `./feature-service-composition-standard-scans.test.ts` — the correlational
 *    rules ESLint cannot express, each with an exact file-count assertion and a
 *    negative control.
 *
 * This file previously asserted that the standard's *documentation* still
 * contained certain sentences, and that a few modules still exported certain
 * names. It inspected no service, hook or page, so it would have passed
 * unchanged with every one of them violating every rule in the standard — and
 * two of its assertions pinned `createIdempotentRequest` as a required export
 * while that helper had zero production call sites, so the test was actively
 * protecting dead code (eiams-frontend-xlfs).
 *
 * What remains here is the one thing a source scan cannot do: guard that the
 * standard document itself still exists and still says something. A rule set
 * that outlives its written rationale is how a standard quietly stops being
 * one.
 */
describe('feature service composition standard (document)', () => {
  it('exists and is a substantive document, not a stub or a truncated file', () => {
    expect(compositionStandard.length).toBeGreaterThan(2000)
  })

  it('still states the boundaries the enforced rules depend on', () => {
    // These are anchors, not a spell-check: each one names a boundary that a
    // rule in eslint.config.js or in the scans file actually enforces, so if a
    // future edit removes the rationale for a rule, this fails and the rule can
    // be reconsidered deliberately rather than left orphaned.
    expect(compositionStandard).toContain('satisfies keyof paths')
    expect(compositionStandard).toContain('createFeatureService(client: AxiosInstance)')
    expect(compositionStandard).toMatch(/withIdempotencyKey\(idempotencyKey\)/u)
    expect(compositionStandard).toMatch(/must not create an\s+Axios instance/u)
    expect(compositionStandard).toMatch(/Do not add a\s+global Axios retry interceptor/u)
  })
})
