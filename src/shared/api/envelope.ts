/**
 * The EIAMS response envelope, exactly as the backend emits it.
 *
 * Verified 2026-09-29 against a running API rather than read off the
 * provisional OpenAPI snapshot, which described bare payloads. The two disagree,
 * and the backend is authoritative for what is on the wire
 * (ruling R-003, `docs/backend-contract-reconciliation.md` §2).
 *
 * Captured samples:
 *
 * ```json
 * {"success":true,"data":[{…}],"pagination":{"page":1,"page_size":2,
 *  "total_items":1,"total_pages":1,"has_previous_page":false,
 *  "has_next_page":false,"total_count":1},
 *  "meta":{"request_id":"…","timestamp":"…"}}
 * ```
 *
 * ```json
 * {"success":false,"error":{"code":"USERS_INVALID_REFRESH_TOKEN",
 *  "message":"The provided refresh token is invalid or has expired",
 *  "details":{},"request_id":"…"}}
 * ```
 *
 * Four properties of this shape drive everything in this module:
 *
 * 1. `data` is wrapped. Returning `response.data` from Axios yields the
 *    ENVELOPE, not the payload — the single defect that made every service in
 *    this repository wrong against the real API.
 * 2. `pagination` is a SIBLING of `data`, not a property of it. A paged list is
 *    `data: T[]`, not `data: { items: T[] }`.
 * 3. Paging is ONE-BASED on both sides: the request is `?page=1`, never `?page=0`.
 * 4. `details` is `{}` when there is nothing to report, never absent.
 */

/** Correlation id and server timestamp, present on EVERY response. */
export interface ApiResponseMeta {
  request_id: string
  timestamp: string
}

/** Wire pagination, verbatim. `Range(1, …)` on the backend makes 1 the minimum. */
export interface ApiPaginationResponse {
  page: number
  page_size: number
  total_items: number | null
  total_pages: number | null
  has_previous_page: boolean
  has_next_page: boolean
  total_count: number | null
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  pagination: ApiPaginationResponse | null
  meta: ApiResponseMeta
}

/**
 * Field-level validation detail.
 *
 * Three shapes reach this field and all must be tolerated:
 * `ApiProblemDetails` emits `Record<fieldPath, string[]>`; `CustomResults` emits
 * `{ errors: [...] }` for a `ValidationError`; a domain error with no detail is
 * an empty object.
 */
export type ApiErrorDetails = Record<string, unknown>

export interface ApiError {
  /** UPPER_SNAKE_CASE, normalized server-side by `ApiResults.NormalizeErrorCode`. */
  code: string
  /** English. Never shown to a user — the UI is Arabic-first. */
  message: string
  details: ApiErrorDetails
  request_id: string
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
}

/** Created-resource response, e.g. `POST /warehouses`. */
export interface ResourceIdResponse {
  id: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True only for the backend's real error envelope. */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value['success'] === false &&
    isRecord(value['error']) &&
    typeof (value['error'] as Record<string, unknown>)['code'] === 'string'
  )
}

/** True for the backend's real success envelope. */
export function isApiSuccessResponse<T>(value: unknown): value is ApiSuccessResponse<T> {
  return isRecord(value) && value['success'] === true && 'data' in value
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readPagination(value: unknown): ApiPaginationResponse | null {
  if (!isRecord(value)) {
    return null
  }

  const { page, page_size: pageSize } = value

  if (typeof page !== 'number' || typeof pageSize !== 'number') {
    return null
  }

  const numeric = (key: string): number | null =>
    typeof value[key] === 'number' ? (value[key] as number) : null

  return {
    page,
    page_size: pageSize,
    total_items: numeric('total_items'),
    total_pages: numeric('total_pages'),
    has_previous_page: value['has_previous_page'] === true,
    has_next_page: value['has_next_page'] === true,
    total_count: numeric('total_count'),
  }
}

/**
 * A paged list in the shape the UI consumes: one-based, totals resolved.
 * The single translation from wire paging to table paging.
 */
/**
 * A paged success payload, in the exact shape the API sends.
 *
 * Verified against the live API: `pagination` is a TOP-LEVEL object and its
 * members are snake_case, and the rows sit under `data`. There is no `items`
 * key and no camelCase anywhere. The previous version of this type declared
 * `items` / `pageSize` / `totalCount` / `hasNextPage`, which matches nothing the
 * API produces and was referenced by nothing except itself — so it would have
 * silently mis-typed every paged service return in Stage D.
 */
export interface ApiPage<T> extends ApiPaginationResponse {
  readonly data: readonly T[]
}

/**
 * The page shape the UI works in.
 *
 * The wire is snake_case with the rows under `data`; the UI wants camelCase with
 * the rows under `items`. Converting once, here, is what keeps the service
 * boundary honest without a 113-site ripple through every list page, every table
 * and every test: `pageRows` keeps reading `page.items` and nothing above a
 * service has to know the backend uses snake_case.
 *
 * `totalCount` prefers `total_count` and falls back to `total_items`, because the
 * backend sends both today with the same value; if one is ever dropped or renamed,
 * a table must not fall back to showing "0 results".
 */
export interface UiPage<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
}

export function toUiPage<T>(page: ApiPage<T>): UiPage<T> {
  return {
    items: page.data,
    page: page.page,
    pageSize: page.page_size,
    totalCount: page.total_count ?? page.total_items ?? page.data.length,
    totalPages: page.total_pages ?? 1,
    hasNextPage: page.has_next_page,
  }
}

function unwrapEnvelope<T>(value: ApiResponse<T>): ApiSuccessResponse<T> {
  if (isApiErrorResponse(value)) {
    throw new Error(`Unwrap expected a success envelope but received "${value.error.code}".`)
  }

  if (!isApiSuccessResponse<T>(value)) {
    throw new Error('Unwrap received a payload that is not an EIAMS response envelope.')
  }

  return value
}

/**
 * Unwraps a non-paged payload.
 *
 * Throws rather than returning the envelope, because a caller that forgot to
 * unwrap would otherwise silently receive `{ success, data, meta }` and fail
 * later on a property access with an unrelated error.
 */
export function unwrapData<T>(value: ApiResponse<T>): T {
  return unwrapEnvelope(value).data
}

/**
 * Unwraps a paged list into `ApiPage`.
 *
 * A response with no pagination block is a single page, not an error:
 * `ApiResults.Success` and some lists legitimately omit it, and a single-page
 * list must still render.
 */
export function unwrapPage<T>(value: ApiResponse<readonly T[]>): ApiPage<T> {
  const envelope = unwrapEnvelope(value)
  const data = Array.isArray(envelope.data) ? envelope.data : []
  const pagination = readPagination(envelope.pagination)

  if (pagination === null) {
    return {
      data,
      page: 1,
      page_size: data.length,
      total_items: data.length,
      total_pages: 1,
      has_previous_page: false,
      has_next_page: false,
      total_count: data.length,
    }
  }

  return {
    ...pagination,
    data,
    // total_count and total_items carry the same value today; total_count is the
    // one the UI means, and the first non-null wins so neither absence nor a
    // future rename of the other leaves the table showing "0 results".
    total_count: pagination.total_count ?? pagination.total_items ?? data.length,
    total_pages: pagination.total_pages ?? 1,
  }
}

/**
 * Normalizes a wire error code to UPPER_SNAKE_CASE.
 *
 * The backend already normalizes on the way out — `ApiResults.NormalizeErrorCode`
 * turns `Users.NotFound` into `USERS_NOT_FOUND` — so codes actually seen on the
 * wire are already in that form and need only upper-casing. This replicates the
 * backend's own rule rather than inventing one, because a frontend and backend
 * that normalize differently would silently disagree on the single string that
 * selects the user-facing message: `Users.NotFound` reduced by a simpler rule
 * yields `USERS_NOTFOUND`, matching no mapping entry and degrading to a generic
 * status message.
 */
export function normalizeWireErrorCode(value: unknown): string | null {
  const code = nonEmptyString(value)
  if (code === null) {
    return null
  }

  let normalized = ''

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] as string

    if (!/[A-Za-z0-9]/u.test(character)) {
      if (normalized !== '' && !normalized.endsWith('_')) {
        normalized += '_'
      }
      continue
    }

    const previous = index > 0 ? (code[index - 1] as string) : ''
    if (normalized !== '' && /[A-Z]/u.test(character) && /[a-z]/u.test(previous)) {
      normalized += '_'
    }

    normalized += character.toUpperCase()
  }

  const trimmed = normalized.replace(/^_+|_+$/gu, '')
  return trimmed.length === 0 ? null : trimmed
}

/** Reads the backend's `error` block from an unknown payload, if present. */
export function readApiError(value: unknown): ApiError | null {
  if (!isApiErrorResponse(value)) {
    return null
  }

  const raw = value.error as unknown as Record<string, unknown>

  return {
    code: nonEmptyString(raw['code']) ?? 'UNKNOWN',
    message: nonEmptyString(raw['message']) ?? '',
    details: isRecord(raw['details']) ? raw['details'] : {},
    request_id: nonEmptyString(raw['request_id']) ?? '',
  }
}
