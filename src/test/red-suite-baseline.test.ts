import baselineJson from './baselines/red-suite-baseline.json'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { sourceFilesIn } from './support/source-scan'

/**
 * Guards the no-regression baseline EPIC G7 is verified against.
 *
 * `scripts/test-baseline.mjs` is the real check - it re-runs the suite and diffs
 * per-file outcomes. This suite exists because that script is only ever run by a
 * human or an agent, and a baseline that can be quietly emptied is worse than no
 * baseline at all: the gate would report "no drift" while proving nothing.
 *
 * So the baseline's own integrity is asserted here, in the ordinary test run,
 * with the same non-vacuity discipline the rest of the repo already uses.
 */
type Baseline = {
  $comment: string[]
  capturedAt: string
  capturedAtCommit: string
  rootCause: string
  totalFiles: number
  failedFiles: number
  totalTests: number
  failedTests: number
  failingFiles: string[]
  allFiles: string[]
  knownFlaky: { file: string; reason: string }[]
}

const baseline = baselineJson as Baseline

/** Every test file in the repository, which is what a baseline is made OF. */
const ALL_TEST_FILES: readonly string[] = sourceFilesIn(join(process.cwd(), 'src'))
  .filter((file) => /\.test\.tsx?$/u.test(file))
  .map((file) =>
    file
      .split('\\')
      .join('/')
      .replace(`${process.cwd().split('\\').join('/')}/`, ''),
  )
  .sort()

describe('red-suite baseline integrity', () => {
  it('names the bead responsible for the known-red suite', () => {
    expect(baseline.rootCause).toBe('eiams-frontend-9uuf')
    expect(baseline.capturedAtCommit).toMatch(/^[0-9a-f]{7,40}$/u)
  })

  it('agrees with its own list length, so the totals cannot be hand-edited', () => {
    expect(baseline.failingFiles.length).toBe(baseline.failedFiles)
    expect(baseline.allFiles.length).toBe(baseline.totalFiles)
    expect(baseline.failedTests).toBeGreaterThan(0)
    expect(baseline.totalTests).toBeGreaterThan(baseline.failedTests)
  })

  it('is a non-empty, sorted, duplicate-free list of real test files', () => {
    // Non-empty: an emptied baseline would make the drift gate vacuous, which is
    // the exact failure mode this assertion exists to prevent.
    expect(baseline.failingFiles.length).toBeGreaterThan(0)
    expect([...baseline.failingFiles].sort()).toEqual(baseline.failingFiles)
    expect(new Set(baseline.failingFiles).size).toBe(baseline.failingFiles.length)

    const known = new Set(ALL_TEST_FILES)
    for (const name of baseline.failingFiles) {
      expect(known.has(name), `${name} is in the baseline but no longer exists`).toBe(true)
    }
  })

  it('leaves most of the suite unnamed, so it can tell partial from total failure', () => {
    // The negative control. If every test file were listed, the baseline could
    // not distinguish "some suites are red" from "the whole suite is red", and a
    // guard that cannot tell those apart proves nothing.
    //
    // This compares against the baseline's OWN recorded roster, not the live
    // tree. Pinning to the live count would break on every added or removed
    // test file, and a guard that cries wolf on ordinary growth gets ignored —
    // which is how the real version of this guard dies. `test-baseline.mjs`
    // already reports added/removed files explicitly; here we only assert the
    // invariant that must hold at any moment: the red set is a strict minority.
    expect(baseline.failingFiles.length).toBeLessThan(baseline.allFiles.length / 2)
  })

  it('keeps every known-flaky entry justified, so it cannot become a dumping ground', () => {
    // A flaky exclusion with no stated reason is indistinguishable from
    // "whatever keeps failing gets excused here". Each one must name a real
    // mechanism, and the set must stay small enough to stay reviewable.
    for (const entry of baseline.knownFlaky) {
      expect(entry.reason.length, `${entry.file} needs a real reason`).toBeGreaterThan(40)
      expect(entry.file, entry.file).toMatch(/\.test\.tsx?$/u)
    }
    expect(baseline.knownFlaky.length).toBeLessThanOrEqual(5)
  })

  it('explains in-source why the baseline exists and how to regenerate it', () => {
    const comment = baseline.$comment.join('\n')
    expect(comment).toContain('eiams-frontend-9uuf')
    expect(comment).toContain('no test outcome')
    expect(comment).toContain('--accept')
    // The regeneration instruction must say regeneration is not a convenience,
    // or the next agent will reach for it to silence a failure.
    expect(comment).toMatch(/never regenerate to silence/iu)
  })
})
