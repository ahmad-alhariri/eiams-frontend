import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { pathWithId } from '@/shared/services/api-path'
import { readSource, relativeToRepo, sourceFilesIn } from '@/test/support/source-scan'

/**
 * The direct test of the ONE shared path helper (`eiams-frontend-71fp`).
 *
 * The helper itself lives at `src/shared/services/api-path.ts`; the bead named
 * `src/shared/api/api-path.ts`, which does not exist. This file is its direct
 * test, and it pins the two properties the de-duplication rests on:
 *
 * 1. BEHAVIOUR. Eight services each carried their own three-line copy of the
 *    helper. The copies were compared against the shared one before they were
 *    deleted, and all eight were byte-identical in behaviour
 *    (`path.replace(parameter, encodeURIComponent(id))`, first occurrence only).
 *    These assertions pin that behaviour for the path shapes actually in use,
 *    so a future edit to the shared helper cannot silently change a URL.
 * 2. SINGLE IMPLEMENTATION. A second copy is a defect even when the two
 *    behave identically today: a fix applied to one is then silently absent
 *    from the other. The scan below makes the duplication impossible to
 *    reintroduce.
 */

/** A declaration of the helper: a function, or a const/let/var arrow copy. */
const IMPLEMENTATION = /\b(?:function|const|let|var)\s+pathWithId\b/u

/**
 * This file is excluded from its own scan, and only this file: the
 * non-vacuity control below must contain the banned declaration verbatim, or
 * it would not prove the scan fires.
 */
const GUARD_SELF_PATH = 'src/shared/api/api-path.test.ts'

function declaresImplementation(source: string): boolean {
  return IMPLEMENTATION.test(source)
}

describe('the shared path helper', () => {
  it('replaces the named placeholder with the URI-encoded value', () => {
    expect(pathWithId('/catalog/materials/{materialId}', '{materialId}', 'a b/c')).toBe(
      '/catalog/materials/a%20b%2Fc',
    )
  })

  it('replaces only the FIRST occurrence, exactly like every deleted copy did', () => {
    expect(pathWithId('/a/{id}/b/{id}', '{id}', 'x')).toBe('/a/x/b/{id}')
  })

  it('leaves a path without the placeholder unchanged', () => {
    expect(pathWithId('/warehouses', '{warehouseId}', 'x')).toBe('/warehouses')
  })

  it('fills a path that carries the placeholder after a fixed prefix', () => {
    expect(pathWithId('/custodies/{custodyId}/transfer', '{custodyId}', 'id/with slash')).toBe(
      '/custodies/id%2Fwith%20slash/transfer',
    )
  })
})

describe('the shared path helper is the only implementation (eiams-frontend-71fp)', () => {
  it('declares pathWithId exactly once in the whole src/ tree', () => {
    const offenders = sourceFilesIn(join(process.cwd(), 'src'))
      .filter((file) => relativeToRepo(file) !== GUARD_SELF_PATH)
      .filter((file) => declaresImplementation(readSource(file)))
      .map(relativeToRepo)

    expect(offenders).toEqual(['src/shared/services/api-path.ts'])
  })

  it('would catch a reintroduced copy (non-vacuity)', () => {
    // The scan is over a file set, so it must be able to see a file at all.
    expect(sourceFilesIn(join(process.cwd(), 'src')).length).toBeGreaterThan(0)

    const reintroduced = [
      'function pathWithId(path: string, parameter: string, id: string): string {',
      '  return path.replace(parameter, encodeURIComponent(id))',
      '}',
    ].join('\n')
    expect(declaresImplementation(reintroduced)).toBe(true)

    const arrowCopy =
      'const pathWithId = (path: string, parameter: string, id: string): string => path'
    expect(declaresImplementation(arrowCopy)).toBe(true)

    // A call is not a declaration.
    expect(declaresImplementation('pathWithId(PATH, "{id}", id)')).toBe(false)
  })
})
