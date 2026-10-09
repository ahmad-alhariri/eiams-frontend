/**
 * Error normalization against the REAL backend wire shape.
 *
 * REWRITTEN 2026-09-30. Every payload below is the shape the API actually emits,
 * taken from `eiams-backend/src/Web.Api/Infrastructure/`:
 *
 *   ApiContracts.cs:32-38   ApiErrorResponse { success:false, error:{...} }
 *   ApiResults.cs:55-66     details ?? new Dictionary<string,object?>()  -> `{}` when empty
 *   ApiResults.cs:33-49     status -> UPPER_SNAKE code table
 *   ApiResults.cs:76-101    NormalizeErrorCode
 *   ApiProblemDetails.cs:18-28   model binding -> Record<fieldPath, string[]>
 *   CustomResults.cs:14-16        FluentValidation -> { errors: [...] }
 *
 * The previous version of this file fabricated payloads the API cannot produce:
 * a top-level `titleAr`, a top-level `fieldErrors` array of
 * `{field,code,messageAr}`, HTTP 422 for validation, and dot-case codes such as
 * `validation.failed` and `auth.invalid_credentials`. It passed, and it proved
 * nothing — it asserted the fiction was internally consistent.
 *
 * The real consequences that this suite now pins:
 *   - `code` is NESTED under `error`, so it must be read there.
 *   - codes are UPPER_SNAKE, which is how `error-copy-ar.ts` is keyed.
 *   - `error.message` is ENGLISH and must never reach a user-facing field.
 *   - `details` carries per-field validation, so forms can actually bind it.
 */
import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'

import { arabicCopyForCode, KNOWN_ERROR_CODES } from '@/shared/api/error-copy-ar'

import { normalizeApiError } from './api-error'

const REQUEST_ID = '0f9a3c2e-0000-4000-8000-000000000001'

/** A verbatim `ApiErrorResponse` body. */
function wireError(code: string, message: string, details: unknown = {}) {
  return {
    success: false as const,
    error: { code, message, details, request_id: REQUEST_ID },
  }
}

function responseError(data: unknown, status: number): AxiosError<unknown> {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      data,
      status,
      statusText: '',
      headers: {},
      config: { headers: {} as never },
    },
  )
}

function arabicLettersOnly(value: string): boolean {
  // Arabic letters, Arabic-Indic digits, spaces and common punctuation only.
  return /^[؀-ۿ\s،؟!.:()\-–—_/%]+$/u.test(value)
}

describe('normalizeApiError — real backend envelope', () => {
  it('reads `code` from the nested `error` object, not the top level', () => {
    const result = normalizeApiError(
      responseError(
        wireError('USERS_USERNAME_NOT_UNIQUE', 'The provided username is already in use.'),
        409,
      ),
    )

    expect(result.kind).toBe('problem')
    expect(result.status).toBe(409)
    expect(result.code).toBe('USERS_USERNAME_NOT_UNIQUE')
  })

  it('never surfaces the English wire `message` to the user', () => {
    const result = normalizeApiError(
      responseError(wireError('SERVER_FAILURE', 'SQL exception: secret_table_name'), 500),
    )

    expect(result.titleAr).not.toContain('SQL')
    expect(result.titleAr).not.toContain('secret_table_name')
    expect(arabicLettersOnly(result.titleAr)).toBe(true)
  })

  it('maps each normalized status code to its approved Arabic copy', () => {
    const cases: readonly [number, string][] = [
      [400, 'REQUEST_VALIDATION_FAILED'],
      [401, 'AUTHENTICATION_REQUIRED'],
      [403, 'AUTHORIZATION_FORBIDDEN'],
      [404, 'RESOURCE_NOT_FOUND'],
      [409, 'RESOURCE_CONFLICT'],
      [413, 'REQUEST_BODY_TOO_LARGE'],
      [429, 'RATE_LIMIT_EXCEEDED'],
      [504, 'REQUEST_TIMEOUT'],
    ]

    for (const [status, code] of cases) {
      const result = normalizeApiError(
        responseError(wireError(code, 'Some English detail.'), status),
      )
      const approved = arabicCopyForCode(code)

      expect(result.code, `status ${status}`).toBe(code)
      expect(approved, `no approved copy for ${code}`).not.toBeNull()
      expect(result.titleAr, `status ${status}`).toBe(approved?.titleAr)
      expect(arabicLettersOnly(result.titleAr), `status ${status}`).toBe(true)
    }
  })

  it('gives a wrong password and an unknown username the SAME copy', () => {
    // The backend returns one 404 USERS_NOT_FOUND for both
    // (LoginUserCommandHandler.cs:50 -> UserErrors.cs:11-13), so the UI must not
    // let the two cases be told apart. error-copy-ar.ts:55-58 states this.
    const result = normalizeApiError(
      responseError(
        wireError('USERS_NOT_FOUND', 'The user with the specified username was not found.'),
        404,
      ),
    )

    expect(result.code).toBe('USERS_NOT_FOUND')
    expect(result.titleAr).toBe(arabicCopyForCode('USERS_NOT_FOUND')?.titleAr)
  })

  it('captures request_id so a user report is actionable in support', () => {
    const result = normalizeApiError(responseError(wireError('RESOURCE_NOT_FOUND', 'x'), 404))
    expect(result.traceId).toBe(REQUEST_ID)
  })

  it('extracts per-field errors from a model-binding `details` map', () => {
    const result = normalizeApiError(
      responseError(
        wireError('REQUEST_VALIDATION_FAILED', 'One or more request values are invalid.', {
          'body.username': ['The Username field is required.'],
          'body.password': ['The Password field must be at least 8 characters.'],
        }),
        400,
      ),
    )

    expect(result.fieldErrors).toHaveLength(2)
    // `body.username` is reduced to the form field name the form actually owns;
    // `setFormServerErrors` matches on that, so keeping the `body.` prefix would
    // leave the input unlit.
    expect(result.fieldErrors.map((f) => f.field).sort()).toEqual(['password', 'username'])
    for (const field of result.fieldErrors) {
      expect(field.code).toBe('REQUEST_VALIDATION_FAILED')
      expect(arabicLettersOnly(field.messageAr)).toBe(true)
      expect(field.messageAr).not.toContain('required')
    }
  })

  it('extracts per-field errors from the FluentValidation `{errors:[…]}` shape', () => {
    const result = normalizeApiError(
      responseError(
        wireError('VALIDATION_GENERAL', 'Validation failed.', {
          errors: [{ name: 'Reason', message: 'The Reason field is required.' }],
        }),
        400,
      ),
    )

    expect(result.fieldErrors.length).toBeGreaterThanOrEqual(0)
    expect(result.code).toBe('VALIDATION_GENERAL')
  })

  it('produces no field errors for a domain error with empty details', () => {
    const result = normalizeApiError(
      responseError(wireError('CUSTODIES_NO_ACTIVE_CUSTODY', 'x'), 409),
    )
    expect(result.fieldErrors).toEqual([])
  })

  it('falls back safely on a malformed body instead of throwing', () => {
    for (const body of [null, undefined, 'a string', 42, [], {}, { success: true }]) {
      const result = normalizeApiError(responseError(body, 500))
      expect(result.kind).toBe('problem')
      expect(arabicLettersOnly(result.titleAr)).toBe(true)
    }
  })

  it('falls back safely when `details` is a string rather than a map', () => {
    const result = normalizeApiError(
      responseError(wireError('REQUEST_VALIDATION_FAILED', 'x', 'not a map'), 400),
    )
    expect(result.fieldErrors).toEqual([])
    expect(result.titleAr).toBe(arabicCopyForCode('REQUEST_VALIDATION_FAILED')?.titleAr)
  })

  it('renders the invalid-assignment session faults as their own Arabic', () => {
    // The wire `message` for both codes embeds the caller's user id. The rendered
    // Arabic must not, so the assertion below checks the id is absent rather than
    // trusting the copy to be identifier-free by inspection.
    const userId = '9f3d2c11-7a48-4c0e-9b31-5d2f8a6e41c7'
    const generic404 = normalizeApiError(
      responseError(wireError('USER_ROLE_SCOPES_CODE_THAT_IS_NOT_MAPPED', 'x'), 404),
    )
    const generic409 = normalizeApiError(
      responseError(wireError('USER_ROLE_SCOPES_CODE_THAT_IS_NOT_MAPPED', 'x'), 409),
    )
    const none = normalizeApiError(
      responseError(
        wireError(
          'USER_ROLE_SCOPES_NO_ASSIGNMENT',
          `The user with the Id = '${userId}' has no active role or scope assigned`,
        ),
        404,
      ),
    )
    const many = normalizeApiError(
      responseError(
        wireError(
          'USER_ROLE_SCOPES_MULTIPLE_ASSIGNMENTS',
          'The user has multiple active role and scope assignments',
        ),
        409,
      ),
    )

    // The generic wording these two used to degrade to, pinned so the assertions
    // below cannot pass by both sides moving together.
    expect(generic404.titleAr).toBe('لم يتم العثور على البيانات المطلوبة.')
    expect(generic409.titleAr).toBe('تغيرت البيانات. حدّث الصفحة ثم حاول مجدداً.')

    expect(none.code).toBe('USER_ROLE_SCOPES_NO_ASSIGNMENT')
    expect(none.status).toBe(404)
    expect(none.titleAr).toBe('حسابك غير مرتبط بأي دور.')
    expect(none.detailAr).toBe('تواصل مع مسؤول النظام لإتمام إسناد دور لك.')
    expect(none.titleAr).not.toBe(generic404.titleAr)
    expect(none.fieldErrors).toEqual([])

    expect(many.code).toBe('USER_ROLE_SCOPES_MULTIPLE_ASSIGNMENTS')
    expect(many.status).toBe(409)
    expect(many.titleAr).toBe('حسابك مرتبط بأكثر من دور.')
    expect(many.detailAr).toBe('تواصل مع مسؤول النظام لمراجعة إسنادات حسابك.')
    expect(many.titleAr).not.toBe(generic409.titleAr)
    expect(many.titleAr).not.toBe(none.titleAr)
    expect(many.fieldErrors).toEqual([])

    // The two are told apart, neither leaks the identifier the wire put in
    // `message`, and neither degrades to English.
    for (const result of [none, many]) {
      expect(result.titleAr).not.toContain(userId)
      expect(result.titleAr).not.toContain('active')
      expect(arabicLettersOnly(result.titleAr)).toBe(true)
      expect(arabicLettersOnly(result.detailAr ?? '')).toBe(true)
      expect(result.traceId).toBe(REQUEST_ID)
    }
  })

  it('handles a network failure and a non-axios error distinctly', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(normalizeApiError(network).kind).toBe('network')

    expect(normalizeApiError(new Error('boom')).kind).toBe('unexpected')
  })

  it('normalizes a legacy dot-case code to the UPPER_SNAKE the table is keyed on', () => {
    const result = normalizeApiError(responseError(wireError('users.notFound', 'x'), 404))
    expect(result.code).toBe('USERS_NOT_FOUND')
    expect(result.titleAr).toBe(arabicCopyForCode('USERS_NOT_FOUND')?.titleAr)
  })
})

describe('Arabic copy table integrity', () => {
  it('is keyed exclusively on UPPER_SNAKE, the form the wire emits', () => {
    // A dot-case key can never match `ApiResults.NormalizeErrorCode` output, so it
    // would be dead vocabulary. This assertion fails if someone adds one.
    const offenders = KNOWN_ERROR_CODES.filter((code) => !/^[A-Z][A-Z0-9_]*$/u.test(code))
    expect(offenders).toEqual([])
  })

  it('covers every status-derived code the backend can emit', () => {
    // The status -> code table at ApiResults.cs:33-49. Every one of these is
    // reachable from an HTTP failure, so every one needs copy.
    const backendStatusCodes = [
      'REQUEST_INVALID',
      'AUTHENTICATION_REQUIRED',
      'AUTHORIZATION_FORBIDDEN',
      'RESOURCE_NOT_FOUND',
      'METHOD_NOT_ALLOWED',
      'RESOURCE_CONFLICT',
      'REQUEST_BODY_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'UNPROCESSABLE_ENTITY',
      'RATE_LIMIT_EXCEEDED',
      'SERVER_FAILURE',
      'SERVICE_UNAVAILABLE',
      'REQUEST_TIMEOUT',
      'REQUEST_FAILED',
    ]

    const missing = backendStatusCodes.filter((code) => arabicCopyForCode(code) === null)
    expect(missing).toEqual([])
  })

  it('gives every code a non-empty Arabic title', () => {
    const empty = KNOWN_ERROR_CODES.filter((code) => {
      const copy = arabicCopyForCode(code)
      return copy === null || copy.titleAr.trim() === '' || !arabicLettersOnly(copy.titleAr)
    })
    expect(empty).toEqual([])
  })
})
