#!/usr/bin/env node
/**
 * Fails when the built bundle exceeds the committed budget.
 *
 * This is a SEPARATE script rather than a Vitest test because `pnpm run
 * quality` runs the test suite BEFORE the build, so a test could only ever
 * assert a bundle that does not exist yet. It runs after the build instead.
 *
 * The budget lives in `src/config/bundle-budget.json` and is read here from the
 * SAME file the Vitest tests read, so there is exactly one committed set of
 * numbers.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const budgetPath = join(repoRoot, 'src', 'config', 'bundle-budget.json')
const assetsDir = join(repoRoot, 'dist', 'assets')

function fail(message) {
  console.error(`BUNDLE BUDGET FAILED: ${message}`)
  process.exit(1)
}

if (!existsSync(budgetPath)) {
  fail(`the committed budget is missing at ${budgetPath}`)
}
if (!existsSync(assetsDir)) {
  fail(`the build output is missing at ${assetsDir} - run the build before this check`)
}

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'))
const files = readdirSync(assetsDir)
const jsFiles = files.filter((name) => name.endsWith('.js'))
const jsTotalBytes = jsFiles.reduce((sum, name) => sum + statSync(join(assetsDir, name)).size, 0)
const largestChunkBytes = jsFiles.reduce(
  (largest, name) => Math.max(largest, statSync(join(assetsDir, name)).size),
  0,
)

const checks = [
  ['JS chunk count', jsFiles.length, budget.maxJsChunkCount],
  ['Total JS bytes', jsTotalBytes, budget.maxJsTotalBytes],
  ['Largest JS chunk bytes', largestChunkBytes, budget.maxLargestChunkBytes],
]

console.log('EIAMS bundle budget (regression ceilings)')
console.log('measured at: ' + (budget.measuredAt ?? 'unknown'))
let breached = false
for (const [label, measured, ceiling] of checks) {
  const ok = measured <= ceiling
  breached = breached || !ok
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(24)} measured ${String(measured).padStart(9)}  ceiling ${String(ceiling).padStart(9)}`,
  )
}
if (breached) {
  console.error('')
  console.error('The built bundle grew past the committed ceiling.')
  console.error('If the growth is intended, update src/config/bundle-budget.json deliberately.')
  process.exit(1)
}
console.log('All bundle budgets are within their ceilings.')
