import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Architecture guard for the D-INT-02 pivot.
 *
 * ADR-0001 replaces OpenAPI-generated TypeScript with handwritten per-module
 * wire types. The legacy generated artifact at
 * `src/shared/types/generated/eiams-v1.ts` is frozen migration scaffolding;
 * it is being deleted at `whhu.5` once every module reaches zero imports.
 *
 * Until that close, no source file may add a NEW import from that artifact.
 * This guard walks every `.ts` / `.tsx` file under `src/`, skips itself and
 * the generated artifact directory, and counts regex matches; if the count
 * grows above the committed baseline, the test fails with the offender
 * list.
 *
 * To legitimately re-introduce a generated import, the contributor must:
 *   1. open a P1 contract-decision bead (per
 *      `direct-backend-integration-plan.md` §6 step 4);
 *   2. justify the regression against ADR-0001;
 *   3. bump `BASELINE_IMPORTS` here with a pointer to the bead.
 *
 * Dev fixtures (`src/mocks/`), MSW handlers (`src/test/msw/`), and tests
 * (`src/test/`) are subject to the same rule. The only "tolerance" is the
 * frozen baseline itself.
 */

const SRC_ROOT = join(process.cwd(), 'src')
const TEST_FILE_PATH = join(SRC_ROOT, 'test', 'no-new-generated-imports.test.ts')
const GENERATED_MODULE = '@/shared/types/generated/eiams-v1'

/**
 * Measured on commit 3e298ab (2026-09-02, D-SRS-01 singular-session close)
 * after the file's stray self-import was removed. The test excludes itself
 * from the count so the baseline is the count of imports across the rest
 * of `src/`. Allowed to decrease as modules migrate to handwritten
 * contracts (D-INT-02); update only when a P1 contract-decision bead
 * justifies a new generated-type import.
 */
const BASELINE_IMPORTS = 249

const SCAN_EXTENSIONS = /\.[jt]sx?$/u
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git'])

function walk(directory: string, accumulator: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue
    }
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, accumulator)
      continue
    }
    if (entry.isFile() && SCAN_EXTENSIONS.test(entry.name)) {
      accumulator.push(fullPath)
    }
  }
}

function countGeneratedImports(): { count: number; offenders: string[] } {
  const files: string[] = []
  walk(SRC_ROOT, files)
  const offenders: string[] = []
  let count = 0
  const escapedModule = GENERATED_MODULE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`from\\s+(['"])${escapedModule}\\1`, 'gu')
  for (const file of files) {
    if (file === TEST_FILE_PATH) {
      continue
    }
    const source = readFileSync(file, 'utf8')
    const matches = source.match(pattern)
    if (matches === null) {
      continue
    }
    const relativePath = relative(SRC_ROOT, file).replaceAll('\\', '/')
    count += matches.length
    offenders.push(`${relativePath}: ${matches.length}`)
  }
  return { count, offenders }
}

describe('forbid-new-generated-imports (D-INT-02 / ADR-0001)', () => {
  it('does not gain new @/shared/types/generated/eiams-v1 imports anywhere under src/', () => {
    const { count, offenders } = countGeneratedImports()
    if (count > BASELINE_IMPORTS) {
      const drift = count - BASELINE_IMPORTS
      throw new Error(
        `D-INT-02 regression: ${drift} new generated-type import(s) detected.\n` +
          `Baseline (commit 3e298ab, 2026-09-02): ${BASELINE_IMPORTS}\n` +
          `Current: ${count}\n` +
          `Offenders (path: match count):\n  ${offenders.join('\n  ')}\n\n` +
          `ADR-0001 forbids new generated-type imports. Per the contract-decision ` +
          `policy in direct-backend-integration-plan.md §6 step 4, this regression ` +
          `requires a P1 contract-decision bead before it can be accepted.`,
      )
    }
    expect(count).toBeLessThanOrEqual(BASELINE_IMPORTS)
  })
})
