import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Architecture guard for the D-INT-02 pivot (ADR-0001).
 *
 * ADR-0001 replaced OpenAPI-generated TypeScript with handwritten per-module
 * wire contracts behind the shared `ApiTransport`. Every module has since
 * migrated, so the generated artifact has been DELETED — together with the
 * generator that produced it, the provisional OpenAPI snapshot it was
 * generated from, and the `api:types:*` / `contract:validate` commands that
 * ran it.
 *
 * This guard is the other half of that deletion. It fails if:
 *   1. the generated artifact comes back;
 *   2. any source file imports the path it lived at;
 *   3. the generator, its config, the snapshot validator, or the provisional
 *      snapshot come back.
 *
 * To legitimately reintroduce generated types, open a P1 contract-decision
 * bead (per `direct-backend-integration-plan.md` §6 step 4), justify the
 * regression against ADR-0001, and re-open the artifact deliberately. Do not
 * widen a handwritten contract instead — that is the defect this guard exists
 * to keep from coming back.
 */

const REPO_ROOT = process.cwd()
const SRC_ROOT = join(REPO_ROOT, 'src')
const GENERATED_DIRECTORY = join(SRC_ROOT, 'shared', 'types', 'generated')
/**
 * The deleted module path, assembled from parts so this guard's own source
 * does not contain the literal it forbids: a repository-wide search for that
 * path must find nothing, including in this file.
 */
const GENERATED_MODULE = `@/shared/types/${'generated'}`

/** The generator, its config, its snapshot validator and its input snapshot. */
const DELETED_ARTIFACTS = [
  join(REPO_ROOT, 'scripts', 'generate-api-types.mjs'),
  join(REPO_ROOT, 'scripts', 'openapi-generation.config.mjs'),
  join(REPO_ROOT, 'scripts', 'validate-contract.mjs'),
  join(REPO_ROOT, 'contracts', 'openapi', 'eiams-v1.openapi.json'),
]

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

/** Every file under `src/` that still imports the deleted module path. */
function findGeneratedImports(): string[] {
  const files: string[] = []
  walk(SRC_ROOT, files)
  const escapedModule = GENERATED_MODULE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`from\\s+(['"])${escapedModule}\\1`, 'gu')
  const offenders: string[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (source.match(pattern) !== null) {
      offenders.push(relative(SRC_ROOT, file).replaceAll('\\', '/'))
    }
  }
  return offenders
}

describe('forbid-generated-contract-imports (D-INT-02 / ADR-0001)', () => {
  it('keeps the generated artifact deleted', () => {
    expect(existsSync(GENERATED_DIRECTORY)).toBe(false)
  })

  it('has no import of the deleted generated module anywhere under src/', () => {
    expect(findGeneratedImports()).toEqual([])
  })

  it('keeps the OpenAPI generator and the provisional snapshot deleted', () => {
    expect(DELETED_ARTIFACTS.filter((path) => existsSync(path))).toEqual([])
  })
})
