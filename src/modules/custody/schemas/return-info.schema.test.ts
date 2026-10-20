import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { RETURN_REASON_MAX_LENGTH, returnInfoFormSchema } from './return-info.schema'

const VALID_ISSUE_UUID = '00000000-0000-4000-8000-000000000155'

/**
 * Cross-repo authority check (FIX-R5): the frontend cap is a MIRROR of the
 * backend domain rule in `ReturnInfo.cs` (`normalizedReason.Length is 0 or
 * > 200` ⇒ `ReturnInfoInvalid`). The backend is the authority, so this test
 * reads the sibling checkout and fails loudly when the file is absent or the
 * two caps drift apart — the whole point is catching drift, never skipping.
 */
const backendReturnInfoPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../eiams-backend/src/Domain/ReturnInfos/ReturnInfo.cs',
)

describe('return-info schema (FIX-R1 / FIX-R4 / FIX-R5)', () => {
  it('locks the frontend reason cap to the backend domain cap of 200', () => {
    expect(RETURN_REASON_MAX_LENGTH).toBe(200)
  })

  it('accepts a reason of exactly 200 characters', () => {
    const parse = returnInfoFormSchema.safeParse({
      originalIssueDocumentId: VALID_ISSUE_UUID,
      returnReason: 'ر'.repeat(200),
    })
    expect(parse.success).toBe(true)
  })

  it('rejects a reason of 201 characters with the Arabic max message', () => {
    const parse = returnInfoFormSchema.safeParse({
      originalIssueDocumentId: VALID_ISSUE_UUID,
      returnReason: 'ر'.repeat(201),
    })
    expect(parse.success).toBe(false)
    if (parse.success) {
      throw new Error('a 201-character reason must not parse')
    }
    const issue = parse.error.issues.find(
      (candidate) => candidate.path[candidate.path.length - 1] === 'returnReason',
    )
    expect(issue?.message).toBe('يجب ألا يتجاوز سبب الإرجاع 200 محرفاً.')
  })

  it('rejects an empty and a 2-character reason (min 3)', () => {
    for (const reason of ['', 'رر', '   ']) {
      const parse = returnInfoFormSchema.safeParse({
        originalIssueDocumentId: VALID_ISSUE_UUID,
        returnReason: reason,
      })
      expect(parse.success, `reason ${JSON.stringify(reason)} must not parse`).toBe(false)
      if (parse.success) {
        throw new Error('unreachable')
      }
      const issue = parse.error.issues.find(
        (candidate) => candidate.path[candidate.path.length - 1] === 'returnReason',
      )
      expect(issue?.message).toBe('يجب إدخال سبب الإرجاع.')
    }
  })

  it('rejects a non-uuid originalIssueDocumentId', () => {
    const parse = returnInfoFormSchema.safeParse({
      originalIssueDocumentId: 'not-a-uuid',
      returnReason: 'سبب كافٍ للإرجاع',
    })
    expect(parse.success).toBe(false)
    if (parse.success) {
      throw new Error('a non-uuid issue id must not parse')
    }
    const issue = parse.error.issues.find(
      (candidate) => candidate.path[candidate.path.length - 1] === 'originalIssueDocumentId',
    )
    expect(issue?.message).toBe('يجب إدخال معرّف سند الصرف الأصلي.')
  })

  it('stays aligned with eiams-backend/src/Domain/ReturnInfos/ReturnInfo.cs', () => {
    let source: string
    try {
      source = readFileSync(backendReturnInfoPath, 'utf8')
    } catch {
      // Deliberately LOUD: a silently skipped alignment check would defeat the
      // purpose of this test (catching cap drift between the two repos).
      throw new Error(
        `Cannot read the backend authority file at ${backendReturnInfoPath}. ` +
          `The cross-repo cap-alignment check requires the eiams-backend checkout ` +
          `to sit beside eiams-frontend.`,
      )
    }
    const match = /normalizedReason\.Length is 0 or > (\d+)/u.exec(source)
    expect(
      match,
      'the backend expression `normalizedReason.Length is 0 or > <cap>` changed shape; update this regex',
    ).not.toBeNull()
    expect(Number(match![1])).toBe(RETURN_REASON_MAX_LENGTH)
  })
})
