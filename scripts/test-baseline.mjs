#!/usr/bin/env node
/**
 * No-regression gate for EPIC G7 (`eiams-frontend-vi65.14`).
 *
 * The epic was chartered with "All 135 MSW-dependent test suites still pass", but
 * the suite is already red at HEAD for an unrelated reason
 * (`eiams-frontend-9uuf` — no production code constructs a real `ApiTransport`,
 * so `transport.requestPage is not a function`). That criterion cannot be met by
 * G7, and quietly redefining it as "as green as it was" would be a lie, so the
 * ratified contract is the opposite and much stricter one:
 *
 *   G7 CHANGES NO TEST OUTCOME. NOT ONE FILE, IN EITHER DIRECTION.
 *
 * This script re-runs the suite and diffs the per-file outcome against the
 * committed baseline. It is deliberately STRICTER than "no new failures":
 *
 *   - a newly FAILING file fails the gate, and
 *   - a newly PASSING file ALSO fails the gate.
 *
 * The second direction matters more than it looks. A suite that starts passing
 * for an unintended reason - a handler silently deleted, an assertion loosened
 * into `expect(true)`, a `vi.mock` widened - is exactly how coverage dies
 * quietly, and "the red count went down" is indistinguishable from "the guard
 * was removed". Any outcome change must be a deliberate, recorded act, which is
 * what `--accept` is for.
 *
 * Usage:
 *   pnpm run test:baseline            # verify no drift (exit 1 on any change)
 *   pnpm run test:baseline -- --accept  # rewrite the baseline, print the diff
 *
 * `--accept` is NOT a convenience. Whoever runs it must record WHY in the bead
 * they are working, because a regenerated baseline is indistinguishable from a
 * silenced failure once it is committed.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(root, 'src/test/baselines/red-suite-baseline.json')
const reportPath = join(root, 'node_modules/.tmp/baseline-report.json')

const accept = process.argv.slice(2).includes('--accept')

mkdirSync(dirname(reportPath), { recursive: true })

const run = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--reporter=json',
    `--outputFile=${reportPath}`,
  ],
  { cwd: root, stdio: 'inherit', shell: false },
)

if (run.status !== 0 && run.status !== 1) {
  console.error(`\n[baseline] vitest exited with ${run.status}; cannot compare outcomes.`)
  process.exit(run.status ?? 1)
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))

/** Repo-relative, forward-slashed, so a path matches the baseline's entries. */
const relative = (absolute) =>
  absolute
    .split('\\')
    .join('/')
    .replace(`${root.split('\\').join('/')}/`, '')

const observedFailed = new Set(
  report.testResults.filter((file) => file.status === 'failed').map((file) => relative(file.name)),
)
const observedAll = new Set(report.testResults.map((file) => relative(file.name)))
const expectedFailed = new Set(baseline.failingFiles)

/**
 * Suites whose outcome is not deterministic under full-suite parallel load.
 *
 * Excluded from the pass/fail verdict, never from the report: a gate that flips
 * on a coin toss trains people to re-run it until it goes green, and a gate that
 * is re-run until it agrees is not a gate. Each entry must carry the reason it
 * is flaky, so the list cannot become a place to park anything inconvenient.
 */
const knownFlaky = new Map((baseline.knownFlaky ?? []).map((entry) => [entry.file, entry.reason]))

const regressions = [...observedFailed]
  .filter((name) => !expectedFailed.has(name) && !knownFlaky.has(name))
  .sort()
const unexpectedFixes = [...expectedFailed]
  .filter((name) => !observedFailed.has(name) && !knownFlaky.has(name))
  .sort()
const newFiles = [...observedAll].filter((name) => !baseline.allFiles?.includes(name)).sort()
const removedFiles = (baseline.allFiles ?? []).filter((name) => !observedAll.has(name)).sort()
const flakyOutcomes = [...knownFlaky.keys()]
  .filter((name) => observedAll.has(name))
  .map((name) => `${name} [${observedFailed.has(name) ? 'failed' : 'passed'}] this run`)

const failedTests = report.testResults.reduce(
  (total, file) => total + file.assertionResults.filter((a) => a.status === 'failed').length,
  0,
)
const totalTests = report.testResults.reduce(
  (total, file) => total + file.assertionResults.length,
  0,
)

const section = (title, entries) => {
  if (entries.length === 0) return
  console.log(`\n  ${title} (${entries.length}):`)
  for (const entry of entries) console.log(`    - ${entry}`)
}

console.log(
  `\n[baseline] expected ${expectedFailed.size} failing files / ${baseline.failedTests} failing tests`,
)
console.log(
  `[baseline] observed ${observedFailed.size} failing of ${observedAll.size} files / ${failedTests} failing tests`,
)

section('REGRESSIONS - files that newly fail', regressions)
section(
  'UNEXPECTED FIXES - files that newly pass (coverage may have been deleted)',
  unexpectedFixes,
)
section('NEW FILES - not present in the baseline', newFiles)
section('REMOVED FILES - in the baseline but absent from the run', removedFiles)
section('KNOWN FLAKY - excluded from the verdict, reported every run', flakyOutcomes)

const drifted =
  regressions.length + unexpectedFixes.length + newFiles.length + removedFiles.length > 0

if (!drifted) {
  console.log('\n[baseline] PASS - G7 changed no test outcome.')
  process.exit(0)
}

if (!accept) {
  console.error('\n[baseline] FAIL - test outcomes drifted from the committed baseline.')
  console.error('[baseline] If the change is intended, re-run with --accept and record why.')
  process.exit(1)
}

const next = {
  ...baseline,
  capturedAt: new Date().toISOString().slice(0, 10),
  totalFiles: observedAll.size,
  failedFiles: observedFailed.size,
  totalTests,
  failedTests,
  failingFiles: [...observedFailed].sort(),
  allFiles: [...observedAll].sort(),
  knownFlaky: (baseline.knownFlaky ?? []).filter((entry) => observedAll.has(entry.file)),
}

writeFileSync(`${baselinePath}.next`, `${JSON.stringify(next, null, 2)}\n`)
renameSync(`${baselinePath}.next`, baselinePath)
console.log(`\n[baseline] ACCEPTED - baseline rewritten. Record the reason in your bead.`)
