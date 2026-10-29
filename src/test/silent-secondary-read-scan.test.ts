import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  silentSecondaryReadOffenders,
  silentSecondaryReadOffendersIn,
} from './support/source-scan'

/**
 * A failed SECONDARY read must stay distinguishable from an empty one.
 *
 * The defect class this workstream shipped three times (e24-t08, e24-t09,
 * e24-t10): a secondary query fails, the page collapses the failure into the
 * value it also uses for "not loaded" or "not present", and the UI then states
 * something it has no basis to state — a filter dropdown with no options reads
 * as "nothing is configured" rather than "the read failed", and the user acts
 * on a silently partial view.
 *
 * The detector lives in `support/source-scan.ts` so there is ONE implementation
 * of the rule; the file scan and every negative control below run through it,
 * because a control that exercises different code than production proves
 * nothing about the detector it is meant to validate.
 *
 * Non-vacuity evidence, per `support/source-scan.ts`:
 *
 *  1. an EXACT file-count assertion (`assertScannedFiles`) — a narrowed or
 *     broken glob leaves a handful of files rather than none, and `> 0` would
 *     wave that through while every "no offenders" assertion below passes
 *     silently;
 *  2. a negative control per behaviour — the detector fires on a known-bad
 *     snippet at the moment the suite runs, independent of the codebase;
 *  3. offender lists of repo-relative `path:line`, so a failure names the site
 *     instead of printing a blob of source.
 */

/**
 * The exact production-file count this scan covers.
 *
 * The same set the repository already pins in `no-transport-mask.test.ts` and
 * `no-runtime-test-imports.test.ts`: every non-test file under `src`. Moving
 * this number means the file set moved and every finding below must be
 * re-examined, so it fails loudly instead of drifting.
 */
// +2 since 407: `shared/layout/route-focus-announcer.tsx` (the route focus
// announcer) and `shared/layout/route-keys.ts` (the route key resolver) are
// new application files. They read no test support, so the no-offenders
// assertion below stays green.
const EXPECTED_SCANNED_FILES = 409

describe('a failed secondary read stays distinguishable (source scan)', () => {
  it('scans the expected production file set, so a narrowed glob cannot pass silently', () => {
    assertScannedFiles(applicationSourceFiles(), EXPECTED_SCANNED_FILES)
  })

  describe('negative control', () => {
    it('reports a collapsed read whose query never consults its error state', () => {
      // The shape that shipped three times: a secondary read collapsed into an
      // empty list, with no `isError` anywhere in the file.
      const probe = [
        'function C() {',
        '  const q = useThingQuery()',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('accepts a collapsed read whose query handles its own error', () => {
      const probe = [
        'function C() {',
        '  const q = useThingQuery()',
        '  if (q.isError) return <ErrorState />',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(0)
    })

    it('correlates per variable, so an unrelated error branch does not excuse it', () => {
      // File-scoped correlation would clear this site, because the file DOES
      // handle an error — just not this query's.
      const probe = [
        'function C() {',
        '  const other = useOtherQuery()',
        '  const q = useThingQuery()',
        '  if (other.isError) return null',
        '  return <p>{q.data ?? []}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(1)
    })

    it('accepts a site excused by a source-side standard-allow marker', () => {
      // The exclusion is recorded in the SOURCE and read by the scan, never in
      // a filter inside a test: the marker sits next to the code it excuses.
      const probe = [
        'function C() {',
        '  // standard-allow: silent-secondary-read — the read is permission-gated, so the empty list is the documented state',
        '  const roles = q.data ?? []',
        '  return <p>{roles.length}</p>',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toHaveLength(0)
    })

    it('reports the line the collapse sits on, so a failure names the site', () => {
      const probe = [
        'function C() {',
        '  const q = useThingQuery()',
        '  return q.data ?? null',
        '}',
      ].join('\n')
      expect(silentSecondaryReadOffendersIn('probe', probe)).toEqual(['probe:3'])
    })
  })

  it('no production file collapses a failed read into an empty value', () => {
    const offenders = silentSecondaryReadOffenders(applicationSourceFiles())
    expect(
      offenders,
      `silent secondary reads — a failed read must stay distinguishable from an empty one:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
