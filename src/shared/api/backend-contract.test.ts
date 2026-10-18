import { describe, expect, it } from 'vitest'

import { arabicCopyForCode, KNOWN_ERROR_CODES } from '@/shared/api/error-copy-ar'
import { applicationSourceFiles, readSource, relativeToRepo } from '@/test/support/source-scan'
import {
  isApiErrorResponse,
  isApiSuccessResponse,
  normalizeWireErrorCode,
  readApiError,
  unwrapData,
  unwrapPage,
} from '@/shared/api/envelope'

/**
 * Every payload below was captured from a RUNNING backend on 2026-09-29, not
 * written from the provisional OpenAPI snapshot. That distinction is the entire
 * point: the snapshot described bare payloads and lowerCamel error codes, and
 * building against it is what made the previous normalizer dead code.
 */

/** Verbatim `GET /api/v1/admin/users?page=1&pageSize=2`. */
const PAGE_SUCCESS = {
  success: true,
  data: [
    {
      id: 'bc6711be-e595-46cc-bdf5-9139feebbc24',
      email: 'admin@eiams.local',
      firstName: 'System',
      lastName: 'Administrator',
      employeeId: null,
      employeeName: null,
      status: 'Active',
      lastLoginUtc: '2026-09-29T09:12:54.997042Z',
      createdAtUtc: '2026-09-28T18:31:16.116954Z',
      roleId: '00000000-0000-0000-0000-000000000001',
      roleName: 'SYSTEM_ADMIN',
      scopeType: 'Enterprise',
      scopeId: null,
    },
  ],
  pagination: {
    page: 1,
    page_size: 2,
    total_items: 1,
    total_pages: 1,
    has_previous_page: false,
    has_next_page: false,
    total_count: 1,
  },
  meta: {
    request_id: '064a1a6f-9d88-46c0-bc49-8c3f84521bc3',
    timestamp: '2026-09-29T09:12:55.1732567Z',
  },
} as const

/** Verbatim `POST /api/v1/auth/refresh` with no cookie. */
const REFRESH_REJECTED = {
  success: false,
  error: {
    code: 'USERS_INVALID_REFRESH_TOKEN',
    message: 'The provided refresh token is invalid or has expired',
    details: {},
    request_id: '75884cb3-8a52-4d6e-862e-347c857d92a9',
  },
} as const

describe('EIAMS response envelope (real backend shape)', () => {
  it('recognises the success and error envelopes', () => {
    expect(isApiSuccessResponse(PAGE_SUCCESS)).toBe(true)
    expect(isApiErrorResponse(PAGE_SUCCESS)).toBe(false)
    expect(isApiErrorResponse(REFRESH_REJECTED)).toBe(true)
    expect(isApiSuccessResponse(REFRESH_REJECTED)).toBe(false)
  })

  it('rejects a bare payload that is not an envelope', () => {
    // The provisional snapshot's shape: this is what every service used to
    // receive and hand straight back to the caller.
    expect(isApiSuccessResponse([{ id: 'x' }])).toBe(false)
    expect(isApiSuccessResponse({ items: [], pageInfo: {} })).toBe(false)
  })

  it('unwraps a non-paged payload to the data itself', () => {
    const response = {
      success: true as const,
      data: { accessToken: 'token', session: {}, expiresInSeconds: 3599 },
      pagination: null,
      meta: { request_id: 'r', timestamp: 't' },
    }

    expect(unwrapData(response).accessToken).toBe('token')
  })

  it('unwraps a paged list with top-level pagination, not data.pageInfo', () => {
    const page = unwrapPage(PAGE_SUCCESS)

    // Snake_case, exactly as the live API sends it, and rows under `data`.
    expect(page.data).toHaveLength(1)
    expect(page.page).toBe(1)
    expect(page.page_size).toBe(2)
    expect(page.total_count).toBe(1)
    expect(page.total_pages).toBe(1)
    expect(page.has_next_page).toBe(false)
  })

  it('treats a missing pagination block as a single page rather than an error', () => {
    const page = unwrapPage({
      success: true,
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: null,
      meta: { request_id: 'r', timestamp: 't' },
    })

    expect(page.data).toHaveLength(2)
    expect(page.total_count).toBe(2)
    expect(page.page).toBe(1)
  })

  it('throws rather than handing back an envelope that forgot to unwrap', () => {
    // A silent return would surface later as a confusing property-access error.
    expect(() => unwrapData(REFRESH_REJECTED)).toThrow(/USERS_INVALID_REFRESH_TOKEN/)
    expect(() => unwrapData({ nothing: true } as never)).toThrow(/envelope/)
  })

  it('normalizes codes the way the backend normalizes them', () => {
    // The backend already emits UPPER_SNAKE; replicating its own rule keeps the
    // two from disagreeing on the string that selects the user-facing message.
    expect(normalizeWireErrorCode('USERS_NOT_FOUND')).toBe('USERS_NOT_FOUND')
    expect(normalizeWireErrorCode('Users.NotFound')).toBe('USERS_NOT_FOUND')
    expect(normalizeWireErrorCode('AUTHORIZATION_FORBIDDEN')).toBe('AUTHORIZATION_FORBIDDEN')
    // Any dotted lowerCamel spelling collapses the same way, which is the point:
    // the normalizer replicates the backend's own rule rather than a narrower one.
    expect(normalizeWireErrorCode('custom.thing')).toBe('CUSTOM_THING')
    expect(normalizeWireErrorCode('  ')).toBeNull()
    expect(normalizeWireErrorCode(42)).toBeNull()
  })

  it('reads the error block and its request id', () => {
    expect(readApiError(REFRESH_REJECTED)?.code).toBe('USERS_INVALID_REFRESH_TOKEN')
    expect(readApiError(REFRESH_REJECTED)?.request_id).toBe('75884cb3-8a52-4d6e-862e-347c857d92a9')
    expect(readApiError(PAGE_SUCCESS)).toBeNull()
  })
})
/**
 * The API's own status-to-code table, transcribed from
 * `ApiResults.ErrorFromStatusCode` in the backend checkout. Every code the API
 * can emit for a bare status must have Arabic copy, because that is the code a
 * user hits when no domain error applies — and a gap here would be invisible
 * until a real user hit it.
 */
const BACKEND_STATUS_CODES = [
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
] as const

/**
 * Domain codes are gated separately from the bare status codes above, because
 * the failure they cause is silent: `ApiResults.CreateErrorResponse` runs every
 * code through `NormalizeErrorCode`, so an unmapped domain code reaches the UI
 * as the generic per-status Arabic fallback and nobody sees the specific
 * message the backend meant to convey. This family is the D-OPEN-02 opening and
 * warehouse-initialization surface; listing it here makes a C# rename or a
 * dropped mapping fail the build instead of reaching a user.
 */
const BACKEND_OPENING_DOMAIN_CODES = [
  'OPENING_DOCUMENTS_ALREADY_INITIALIZED',
  'OPENING_DOCUMENTS_DUPLICATE_MATERIAL',
  'OPENING_DOCUMENTS_CORRECTION_REQUIRES_ADJUSTMENT',
  'OPENING_DOCUMENTS_WAREHOUSE_ALREADY_INITIALIZED',
  'OPENING_DOCUMENTS_OPENING_AS_OF_DATE_REQUIRED',
  'OPENING_DOCUMENTS_OPENING_CAPABILITY_NOT_GRANTED',
  'OPENING_DOCUMENTS_OPENING_QUANTITY_MUST_BE_POSITIVE',
  'OPENING_DOCUMENTS_USE_ZERO_STOCK_INITIALIZATION',
  'OPENING_DOCUMENTS_REVERSAL_BLOCKED_BY_DOWNSTREAM',
  'WAREHOUSE_INITIALIZATION_ALREADY_REVERSED',
  'WAREHOUSE_DOCUMENTS_RECEIVING_REVERSAL_BLOCKED_BY_DOWNSTREAM',
] as const

/**
 * The C# source writes these codes dotted-PascalCase, but the wire never
 * carries that form. Pairing each one with the key this map must use proves the
 * mapping key still follows the backend's own normalization rule rather than a
 * locally reimplemented guess.
 */
const OPENING_DOMAIN_CODE_NORMALIZATION: ReadonlyArray<readonly [string, string]> = [
  ['OpeningDocuments.AlreadyInitialized', 'OPENING_DOCUMENTS_ALREADY_INITIALIZED'],
  ['OpeningDocuments.DuplicateMaterial', 'OPENING_DOCUMENTS_DUPLICATE_MATERIAL'],
  [
    'OpeningDocuments.CorrectionRequiresAdjustment',
    'OPENING_DOCUMENTS_CORRECTION_REQUIRES_ADJUSTMENT',
  ],
  [
    'OpeningDocuments.WarehouseAlreadyInitialized',
    'OPENING_DOCUMENTS_WAREHOUSE_ALREADY_INITIALIZED',
  ],
  ['OpeningDocuments.OpeningAsOfDateRequired', 'OPENING_DOCUMENTS_OPENING_AS_OF_DATE_REQUIRED'],
  [
    'OpeningDocuments.OpeningCapabilityNotGranted',
    'OPENING_DOCUMENTS_OPENING_CAPABILITY_NOT_GRANTED',
  ],
  [
    'OpeningDocuments.OpeningQuantityMustBePositive',
    'OPENING_DOCUMENTS_OPENING_QUANTITY_MUST_BE_POSITIVE',
  ],
  [
    'OpeningDocuments.UseZeroStockInitialization',
    'OPENING_DOCUMENTS_USE_ZERO_STOCK_INITIALIZATION',
  ],
  [
    'OpeningDocuments.ReversalBlockedByDownstream',
    'OPENING_DOCUMENTS_REVERSAL_BLOCKED_BY_DOWNSTREAM',
  ],
  [
    'WarehouseDocuments.ReceivingReversalBlockedByDownstream',
    'WAREHOUSE_DOCUMENTS_RECEIVING_REVERSAL_BLOCKED_BY_DOWNSTREAM',
  ],
  ['WarehouseInitialization.AlreadyReversed', 'WAREHOUSE_INITIALIZATION_ALREADY_REVERSED'],
]

describe('D-OPEN-02 opening and initialization codes (domain-code drift guard)', () => {
  it.each(BACKEND_OPENING_DOMAIN_CODES)('has Arabic copy for the backend code %s', (code) => {
    const copy = arabicCopyForCode(code)
    expect(copy, `no Arabic copy for backend code ${code}`).not.toBeNull()
    expect(copy?.titleAr.trim().length ?? 0).toBeGreaterThan(0)
  })

  it.each(OPENING_DOMAIN_CODE_NORMALIZATION)(
    'normalizes the C# code %s to the key this map uses',
    (dottedCode, expectedKey) => {
      expect(normalizeWireErrorCode(dottedCode), dottedCode).toBe(expectedKey)
    },
  )

  it('speaks no dotted code, because the wire never carries one', () => {
    // The defect this guard was written for: six Arabic messages landed in a
    // module keyed on the C# spelling, so the live lookup could never match.
    for (const [dottedCode] of OPENING_DOMAIN_CODE_NORMALIZATION) {
      expect(arabicCopyForCode(dottedCode), dottedCode).toBeNull()
    }
  })

  it('reproduces the rule observed live on a running backend', () => {
    // The Opening codes above are derived, not observed: provoking one needs an
    // authenticated document-scoped account plus warehouse, capability and
    // document setup. The normalization rule they rely on is the same single
    // function for every domain error, and it WAS observed live on 2026-10-15
    // against the running API on :5000 (backend build db0a372). Both samples
    // below are the C# literal paired with the code that actually came over the
    // wire; the second is deliberately a multi-segment camelCase one because it
    // exercises the humps inside a segment, not just the dot.
    //
    //   POST /api/v1/auth/login                   -> 404 USERS_NOT_FOUND
    //   POST /api/v1/admin/recovery/administrator -> 403 USERS_ADMINISTRATOR_RECOVERY_UNAVAILABLE
    //
    // Source: src/Domain/Users/UserErrors.cs:8 and :48.
    const observed: ReadonlyArray<readonly [string, string]> = [
      ['Users.NotFound', 'USERS_NOT_FOUND'],
      ['Users.AdministratorRecoveryUnavailable', 'USERS_ADMINISTRATOR_RECOVERY_UNAVAILABLE'],
    ]
    for (const [csharpLiteral, wireCode] of observed) {
      expect(normalizeWireErrorCode(csharpLiteral), csharpLiteral).toBe(wireCode)
    }
  })

  it('rejects a dotted error key in production source, because the wire never carries one', () => {
    // The deleted `shared/api/api-error.ts` was exactly this: a quoted
    // dotted-lowercase error map, reachable only from its own test, whose keys
    // could not match a normalized wire code. Twelve of its thirteen keys were
    // also phantom codes the backend has never emitted in any form — they came
    // from the provisional OpenAPI snapshot ADR-0001 retired.
    //
    // The scan is narrow on purpose: a quoted object key of two lowercase
    // segments. Route paths, import specifiers and CSS classes do not take that
    // shape, and any false positive names its file so it is easy to judge.
    const dottedErrorKey = /['"][a-z][a-z0-9_]*\.[a-z][a-z0-9_]*['"]\s*:\s*['"]/u
    const offenders = applicationSourceFiles().filter((file) =>
      dottedErrorKey.test(readSource(file)),
    )
    expect(offenders.map(relativeToRepo)).toEqual([])
  })

  it('would catch a reintroduced dotted error key (non-vacuity)', () => {
    const dottedErrorKey = /['"][a-z][a-z0-9_]*\.[a-z][a-z0-9_]*['"]\s*:\s*['"]/u
    expect(dottedErrorKey.test("  'document.insufficient_stock': 'الرصيد غير كافٍ.'")).toBe(true)
    // A UPPER_SNAKE key — the only shape the wire carries — must not match.
    expect(dottedErrorKey.test('  DOCUMENT_INSUFFICIENT_STOCK: {')).toBe(false)
  })

  it('keeps every mapped code free of Latin characters', () => {
    for (const code of BACKEND_OPENING_DOMAIN_CODES) {
      const copy = arabicCopyForCode(code)
      expect(copy?.titleAr, code).not.toMatch(/[A-Za-z]/u)
      expect(copy?.detailAr ?? '', code).not.toMatch(/[A-Za-z]/u)
    }
  })
})

describe('Arabic error copy (frontend-owned, D-OAS-01 inverted)', () => {
  it.each(BACKEND_STATUS_CODES)('has Arabic copy for the backend code %s', (code) => {
    const copy = arabicCopyForCode(code)
    expect(copy, `no Arabic copy for backend code ${code}`).not.toBeNull()
    expect(copy?.titleAr.trim().length ?? 0).toBeGreaterThan(0)
  })

  it('gives every mapped code non-empty Arabic', () => {
    for (const code of KNOWN_ERROR_CODES) {
      expect(arabicCopyForCode(code)?.titleAr.length ?? 0, code).toBeGreaterThan(0)
    }
  })

  it('never leaks a username through the not-found copy', () => {
    // The API returns a distinct 404 USERS_NOT_FOUND. The copy must be
    // indistinguishable from a generic miss, or the frontend becomes the
    // enumeration oracle the API already is.
    expect(arabicCopyForCode('USERS_NOT_FOUND')?.titleAr).toBe(
      arabicCopyForCode('RESOURCE_NOT_FOUND')?.titleAr,
    )
  })

  it('speaks the two assignment faults the session projection raises', () => {
    // `GetUserSessionQueryHandler` (`Application/Users/GetSession`) refuses to build
    // a session when the CALLER's own account has zero or more than one role+scope
    // assignment, so `GET /auth/session` and `POST /auth/refresh` can put either
    // code on the wire. Unmapped, both rendered as generic per-status Arabic, which
    // reads like a missing record instead of an account nobody has configured.
    expect(arabicCopyForCode('USER_ROLE_SCOPES_NO_ASSIGNMENT')).toEqual({
      titleAr: 'حسابك غير مرتبط بأي دور.',
      detailAr: 'تواصل مع مسؤول النظام لإتمام إسناد دور لك.',
    })
    expect(arabicCopyForCode('USER_ROLE_SCOPES_MULTIPLE_ASSIGNMENTS')).toEqual({
      titleAr: 'حسابك مرتبط بأكثر من دور.',
      detailAr: 'تواصل مع مسؤول النظام لمراجعة إسنادات حسابك.',
    })
  })

  it('tells the two assignment faults apart without naming the account', () => {
    const none = arabicCopyForCode('USER_ROLE_SCOPES_NO_ASSIGNMENT')
    const many = arabicCopyForCode('USER_ROLE_SCOPES_MULTIPLE_ASSIGNMENTS')

    // Distinct from each other: no role and more than one role are different
    // administrator faults, and the administrator has to correct different things.
    expect(none?.titleAr).not.toBe(many?.titleAr)
    expect(none?.detailAr).not.toBe(many?.detailAr)
    // Distinct from the generic 404 / 409 wording, which is what this pair used to
    // render as and what an unmapped code still renders as today.
    expect(none?.titleAr).not.toBe(arabicCopyForCode('RESOURCE_NOT_FOUND')?.titleAr)
    expect(many?.titleAr).not.toBe(arabicCopyForCode('RESOURCE_CONFLICT')?.titleAr)
    // Neither names a role, a scope or an account, and neither offers the user a
    // fix they can apply themselves: both are administrator-configuration faults.
    for (const copy of [none, many]) {
      expect(copy?.detailAr).toContain('مسؤول النظام')
      expect(copy?.detailAr).not.toMatch(/[A-Za-z]/)
      expect(copy?.titleAr).not.toMatch(/[A-Za-z]/)
    }
  })

  it('does not speak a code the wire cannot produce', () => {
    // Guards against a key that no longer matches what the backend normalizes
    // to; such a key is dead copy that would never be selected.
    for (const code of KNOWN_ERROR_CODES) {
      expect(code, `${code} is not UPPER_SNAKE_CASE`).toMatch(/^[A-Z][A-Z0-9_]*$/u)
    }
  })

  it('returns null for an unmapped code so the caller can fall back', () => {
    expect(arabicCopyForCode(null)).toBeNull()
    expect(arabicCopyForCode('SOMETHING_NEW_FROM_THE_API')).toBeNull()
  })
})
