import { describe, expect, it } from 'vitest'

import { isApiErrorResponse } from '@/shared/api/envelope'
import { errJson, toWireErrorResponse } from '@/shared/api/error-envelope'
import { apiJson } from '@/test/msw/envelope'

/**
 * ACCEPTANCE CRITERION 2 for `eiams-frontend-tgl3`:
 * "A test asserts every fixture error body validates against the real
 * ApiErrorResponse schema."
 *
 * Why this is a GUARD and not a one-off assertion: `errJson` and
 * `toWireErrorResponse` are the single funnels every fixture error passes
 * through. If their output ever drifts from `ApiErrorResponse` — a renamed key,
 * a dropped `request_id`, a `code` left un-normalized — every suite in the
 * repository would still pass while asserting a shape the backend never sends.
 * That is precisely the failure `9uuf` found one level down: a browser-side
 * adapter let the fixtures agree with the adapter instead of with the wire.
 *
 * The schema of record is `ApiErrorResponse` (`src/shared/api/envelope.ts:78`):
 *
 *     interface ApiErrorResponse {
 *       success: false
 *       error: {
 *         code: string          // UPPER_SNAKE, normalized by ApiResults.NormalizeErrorCode
 *         message: string       // English, never shown to a user
 *         details: ApiErrorDetails
 *         request_id: string
 *       }
 *     }
 *
 * so the assertions read that shape directly rather than restating it, and
 * `isApiErrorResponse` is the same runtime predicate production uses to tell an
 * error envelope from anything else.
 */

/** `errJson(status, body)` — the status is required by its signature. */
const ERR_JSON_BODIES: ReadonlyArray<
  readonly [label: string, body: Parameters<typeof errJson>[1]]
> = [
  ['a UPPER_SNAKE code', { code: 'WAREHOUSE_NOT_FOUND', message: 'Warehouse not found' }],
  ['a dotted code', { code: 'document.post.invalid_state', message: 'Invalid state' }],
  ['a code needing normalization', { code: 'not-found', message: 'Missing' }],
  ['an empty code', { code: '', message: 'Unknown' }],
  [
    'field errors as a path map',
    { code: 'VALIDATION_FAILED', fieldErrors: { code: ['required'] } },
  ],
  ['field errors as an error list', { code: 'VALIDATION_FAILED', details: { errors: ['bad'] } }],
  ['lifecycle extras', { code: 'ROW_VERSION_CONFLICT', details: { currentRowVersion: 7 } }],
  ['no code at all', { message: 'Something failed' }],
]

/** `toWireErrorResponse(problem, status)`. */
const PROBLEM_BODIES: ReadonlyArray<
  readonly [label: string, problem: Parameters<typeof toWireErrorResponse>[0]]
> = [
  ['a UPPER_SNAKE code', { code: 'DOCUMENT_ALREADY_POSTED' }],
  ['a code needing normalization', { code: 'not-found', detailAr: 'غير موجود' }],
  ['Arabic detail copy', { code: 'FORBIDDEN', detailAr: 'غير مصرّح', titleAr: 'محظور' }],
  [
    'field errors in the lifecycle array form',
    {
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ code: 'required', field: 'code', messageAr: 'مطلوب' }],
    },
  ],
  [
    'lifecycle extras that must reach details',
    { code: 'ROW_VERSION_CONFLICT', currentRowVersion: 7, policy: 'Strict' },
  ],
  ['a legacy traceId that must NOT reach the envelope', { code: 'GATEWAY', traceId: 'abc-123' }],
  ['a problem type', { code: 'BUSINESS_RULE', type: 'https://errors/quantity' }],
]

const ERROR_STATUSES = [400, 401, 403, 404, 409, 422, 500] as const

/** Asserts the parsed body is the real error envelope, field by field. */
function expectValidErrorEnvelope(parsed: unknown) {
  expect(isApiErrorResponse(parsed)).toBe(true)
  expect(parsed).toHaveProperty('success', false)

  const error = (parsed as { error: Record<string, unknown> }).error

  expect(typeof error['code']).toBe('string')
  expect(typeof error['message']).toBe('string')
  expect(typeof error['details']).toBe('object')
  expect(error['details']).not.toBeNull()

  // `request_id` is what the UI shows when a user reports a problem, so a
  // fixture that dropped it would train the UI to render a blank correlation id.
  expect(typeof error['request_id']).toBe('string')
  expect(error['request_id']).not.toBe('')
}

describe('criterion 2: every fixture error body matches the real ApiErrorResponse schema', () => {
  it.each(ERR_JSON_BODIES)('errJson emits a valid envelope for %s', async (_label, body) => {
    expectValidErrorEnvelope(await errJson(400, body).json())
  })

  it.each(PROBLEM_BODIES)(
    'toWireErrorResponse emits a valid envelope for %s',
    async (_l, problem) => {
      expectValidErrorEnvelope(await toWireErrorResponse(problem, 400).json())
    },
  )

  it.each(ERROR_STATUSES)('errJson keeps the envelope valid at status %s', async (status) => {
    expectValidErrorEnvelope(await errJson(status, { code: 'CONFLICT' }).json())
  })

  it('normalizes a lowercase code the way ApiResults.NormalizeErrorCode does', async () => {
    const parsed = (await errJson(404, { code: 'not-found' }).json()) as {
      error: { code: string }
    }

    expect(parsed.error.code).toBe(parsed.error.code.toUpperCase())
    expect(parsed.error.code).not.toBe('not-found')
  })

  it('emits exactly the keys the backend sends, and nothing else', async () => {
    const parsed = (await toWireErrorResponse(
      { code: 'VALIDATION_FAILED', traceId: 'abc' },
      400,
    ).json()) as Record<string, unknown>

    // `traceId` is a legacy field name. Letting it through would train the UI to
    // read a correlation id the real API never provides.
    expect(Object.keys(parsed).sort()).toEqual(['error', 'success'])

    const error = parsed['error'] as Record<string, unknown>
    expect(Object.keys(error).sort()).toEqual(['code', 'details', 'message', 'request_id'])

    // The legacy id is dropped from `details` too, not smuggled inside it.
    expect(error['details']).not.toHaveProperty('traceId')
  })

  it('carries lifecycle extras through to details', async () => {
    const parsed = (await toWireErrorResponse(
      { code: 'ROW_VERSION_CONFLICT', currentRowVersion: 7 },
      409,
    ).json()) as { error: { details: Record<string, unknown> } }

    expect(parsed.error.details['currentRowVersion']).toBe(7)
  })
})

describe('the error classifier does not misread a success body', () => {
  /**
   * Regression: `apiJson` classified any body carrying `code`/`titleAr`/
   * `detailAr`/`traceId`/`fieldErrors` as a `ProblemDetails`, so entities that
   * own a business `code` — `Role.code` is `SYSTEM_ADMIN`, also
   * `Permission.code` and `Material.code` — were rewritten into error envelopes
   * whenever a fixture served them through `apiJson`. An explicit 2xx status now
   * wins over the shape guess, and the guess applies only when no status is given.
   */
  it('treats a 2xx entity that owns a `code` as a success envelope', async () => {
    const role = { roleId: 'r-1', code: 'SYSTEM_ADMIN', nameAr: 'مدير النظام', rowVersion: 1 }
    const parsed = (await apiJson(role, { status: 201 }).json()) as Record<string, unknown>

    expect(isApiErrorResponse(parsed)).toBe(false)
    expect(parsed['success']).toBe(true)
    expect(parsed['data']).toEqual(role)
  })

  it.each([
    ['a permission', { code: 'document.post', nameAr: 'ترحيل مستند' }],
    ['a material domain', { code: 'FUEL', nameAr: 'الوقود' }],
  ])('treats %s served with a 2xx status as a success', async (_label, entity) => {
    expect(isApiErrorResponse(await apiJson(entity, { status: 200 }).json())).toBe(false)
  })

  it('still reads a status-less problem-details body as an error', async () => {
    expect(isApiErrorResponse(await apiJson({ code: 'NOT_FOUND' }).json())).toBe(true)
  })
})

describe('the guard itself rejects a shape the backend cannot produce', () => {
  it.each([
    ['a bare payload', { roleId: 'r-1', code: 'SYSTEM_ADMIN' }],
    ['a bare error block', { code: 'NOT_FOUND', message: 'x', details: {}, request_id: 'r' }],
    ['a success envelope', { success: true, data: [] }],
    ['an error with a non-string code', { success: false, error: { code: 404 } }],
    ['an empty object', {}],
    ['null', null],
  ])('%s is not accepted as an error envelope', (_label, value) => {
    expect(isApiErrorResponse(value)).toBe(false)
  })
})
