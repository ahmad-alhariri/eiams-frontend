import { describe, expect, it } from 'vitest'

import { applicationSourceFiles, readSource, relativeToRepo } from './support/source-scan'

/**
 * One session read path, one implementation.
 *
 * `useCachedSession` (src/modules/auth/hooks/use-cached-session.ts) exists
 * because four byte-identical private copies of the same `useQuery` had been
 * pasted into `route-guards.tsx`, `use-permission.ts`, `sidebar.tsx` and
 * `session-user-menu.tsx`. Copies of a cache observer are worse than copies of
 * a leaf: they can each drift on what they fetch and when, and the app then
 * has several partial views of who is signed in.
 *
 * This gate is deliberately narrow — it forbids re-opening a `useQuery` on the
 * session key, not merely re-declaring a hook of the same name. A second
 * observer under a different name is the failure this catches.
 *
 * Every scan here carries non-vacuity evidence, per `support/source-scan.ts`:
 * an "expect no offenders" assertion over an empty file set proves nothing.
 * The negative control at the bottom is the original copy, verbatim.
 */

/** A `useQuery` opened on the session key by anything other than the shared observer. */
const OWN_SESSION_QUERY = /useQuery<[^>]*>\(\s*\{[^}]*queryKey:\s*authSessionQueryKey/su

/** The one module allowed to open that query: the shared observer itself. */
const CANONICAL_SESSION_OBSERVER = 'src/modules/auth/hooks/use-cached-session.ts'

/**
 * Files whose source matches `pattern`.
 *
 * `support/source-scan.ts` does not export a shared `offenders` helper: the
 * existing scans each keep a private one because they also need their own
 * allow-marker handling. A fresh `lastIndex` is set per file because the
 * pattern carries /g and a shared instance would skip matches on every second
 * file.
 */
function filesMatching(pattern: RegExp, files: readonly string[]): string[] {
  return files.filter((file) => {
    pattern.lastIndex = 0
    return pattern.test(readSource(file))
  })
}

describe('single session-read path', () => {
  it('scans a production file set wide enough for the assertion to mean something', () => {
    // A floor rather than an exact pin, for the reason recorded in
    // design-token-literals.test.ts: every legitimate production file added
    // since this repo started pinning has broken a pin and turned the failure
    // into noise.
    expect(applicationSourceFiles().length).toBeGreaterThan(300)
  })

  it('no production file opens its own useQuery on the session key', () => {
    const found = filesMatching(OWN_SESSION_QUERY, applicationSourceFiles()).filter(
      (file) => relativeToRepo(file) !== CANONICAL_SESSION_OBSERVER,
    )
    expect(
      found.map(relativeToRepo),
      `import and call the exported useCachedSession() from ${CANONICAL_SESSION_OBSERVER} instead of re-opening the session query`,
    ).toEqual([])
  })

  it('the canonical observer still exists and is exported', () => {
    expect(readSource(CANONICAL_SESSION_OBSERVER)).toContain('export function useCachedSession')
  })

  it('would catch a second session query (non-vacuity)', () => {
    const negativeControl = [
      'const { data } = useQuery<SessionResponse>({',
      '  queryKey: authSessionQueryKey,',
      '})',
    ].join('\n')
    expect(OWN_SESSION_QUERY.test(negativeControl)).toBe(true)
  })
})
