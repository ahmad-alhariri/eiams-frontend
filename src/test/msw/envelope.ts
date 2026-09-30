import { HttpResponse } from 'msw'

import { normalizeWireErrorCode } from '@/shared/api/envelope'

/**
 * Fixture helpers that emit the REAL backend envelope.
 *
 * Every MSW handler in this repository used to return a bare payload —
 * `HttpResponse.json([permission])` — which is what the provisional OpenAPI
 * snapshot described and NOT what the API sends. That let the whole service
 * layer be wrong about the wire without a single test noticing. These helpers
 * exist so a fixture cannot express the old shape by accident.
 *
 * `apiJson` is the drop-in for `HttpResponse.json`. It classifies the payload:
 * a non-2xx `status`, or a body carrying an error marker, becomes an error
 * envelope; anything else becomes a success envelope. The classification is
 * deliberately strict — an ambiguous body THROWS rather than guessing, because a
 * silently mis-wrapped fixture produces a test that passes while asserting
 * something the API would never send.
 */

const FIXTURE_META = { request_id: 'test-request-id', timestamp: '2026-01-01T00:00:00.000Z' }

/** Codes a fixture is most likely to use, so `apiJson` can infer an error body. */
const ERROR_CODE_KEYS = ['code', 'titleAr', 'detailAr', 'traceId', 'fieldErrors'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when a body is shaped like the snapshot's `ProblemDetails`. */
function looksLikeProblemDetails(body: unknown): boolean {
  return isRecord(body) && ERROR_CODE_KEYS.some((key) => key in body)
}

/**
 * Derives a wire-shaped code from a fixture body.
 *
 * The snapshot's codes were lowerCamel and dotted; the wire is UPPER_SNAKE. A
 * fixture that still uses the old spelling keeps working rather than silently
 * becoming a code the Arabic table has never heard of.
 */
function isErrorStatus(status: number | undefined): boolean {
  return status !== undefined && (status < 200 || status >= 300)
}

function codeFor(body: Record<string, unknown> | undefined): string {
  const raw = body?.['code']
  if (typeof raw === 'string' && raw.trim() !== '') {
    return normalizeWireErrorCode(raw) ?? raw
  }
  return typeof body?.['titleAr'] === 'string' ? 'REQUEST_INVALID' : 'REQUEST_FAILED'
}

function messageFor(body: Record<string, unknown> | undefined): string {
  const detail = body?.['detailAr']
  return typeof detail === 'string' && detail.trim() !== ''
    ? detail
    : 'The request could not be completed.'
}

/**
 * A `details` map keyed by field path, which is what the API sends
 * (`ApiProblemDetails` emits `Record<path, string[]>`).
 *
 * Passed through UNCHANGED. An earlier version of this helper stringified
 * whatever it was given into `body: [ ... ]`, which is right for a legacy
 * `FieldError[]` but wrong for a real details map: it turned
 * `{ password: [...] }` into a single unaddressable `body` entry, and
 * `normalizeApiError` correctly dropped it as having no field to attach to. The
 * symptom was a login form that stopped showing its field error while every
 * other assertion still passed.
 */
function detailsFor(details: unknown, fieldErrors: unknown): Record<string, unknown> {
  if (isRecord(details)) {
    return details
  }

  if (Array.isArray(details)) {
    return { body: details.map((entry) => String(entry)) }
  }

  if (isRecord(fieldErrors)) {
    return fieldErrors
  }

  if (Array.isArray(fieldErrors)) {
    // Legacy snapshot shape: [{ field, code, messageAr }] -> Record<path, string[]>
    const map: Record<string, string[]> = {}
    for (const entry of fieldErrors) {
      if (!isRecord(entry) || typeof entry['field'] !== 'string') {
        continue
      }
      const field = entry['field']
      const message =
        typeof entry['messageAr'] === 'string' && entry['messageAr'].trim() !== ''
          ? entry['messageAr']
          : 'The submitted value is invalid.'
      map[field] = [...(map[field] ?? []), message]
    }
    return map
  }

  return {}
}

function errorEnvelope(
  code: string,
  titleAr: string,
  details: unknown,
  fieldErrors: unknown,
): Record<string, unknown> {
  // A bare string detail becomes { detail: string } so normalizeApiError can
  // read it as err.details (typeof === 'string' → titleAr override).
  const detailsValue =
    typeof details === 'string' && details.trim() !== ''
      ? { detail: details }
      : detailsFor(details, fieldErrors)
  return {
    success: false,
    error: {
      code,
      message: titleAr,
      details: detailsValue,
      request_id: FIXTURE_META.request_id,
    },
  }
}

function successEnvelope(data: unknown, pagination: unknown): Record<string, unknown> {
  return {
    success: true,
    data: data === undefined ? null : data,
    pagination: isRecord(pagination) ? pagination : null,
    meta: FIXTURE_META,
  }
}

/** A success response carrying `data`, optionally with a wire pagination block. */
export function okJson<T>(data: T, pagination?: unknown): HttpResponse<Record<string, unknown>> {
  return HttpResponse.json(successEnvelope(data, pagination))
}
/** A paged success response, deriving a wire pagination block from the items. */
export function okPageJson<T>(
  items: readonly T[],
  pagination?: {
    page?: number
    pageSize?: number
    totalCount?: number
    totalPages?: number
  },
): HttpResponse<Record<string, unknown>> {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? items.length
  const totalCount = pagination?.totalCount ?? items.length
  const totalPages = pagination?.totalPages ?? (items.length === 0 ? 0 : 1)

  return HttpResponse.json(
    successEnvelope(items, {
      page,
      page_size: pageSize,
      total_items: totalCount,
      total_pages: totalPages,
      has_previous_page: page > 1,
      has_next_page: page < totalPages,
      total_count: totalCount,
    }),
  )
}

/** An error response with the real nested error envelope. */
export function errJson(
  status: number,
  body?: {
    code?: string
    message?: string
    detail?: string
    details?: unknown
    fieldErrors?: unknown
  },
): HttpResponse<Record<string, unknown>> {
  // Only an explicit `detail` becomes `details.detail`. The wire `message` is
  // English and stays on the envelope's `message` field: promoting it into
  // details would let `normalizeApiError` use it as a titleAr override and
  // replace the governed Arabic copy with English server text.
  return HttpResponse.json(
    errorEnvelope(
      codeFor({ code: body?.code }),
      body?.message ?? 'The request could not be completed.',
      typeof body?.detail === 'string' && body.detail.trim() !== ''
        ? { detail: body.detail }
        : detailsFor(body?.details, body?.fieldErrors),
      body?.fieldErrors,
    ),
    { status },
  )
}

/**
 * Wraps a legacy flat `ProblemDetails` in the REAL nested error envelope.
 *
 * The lifecycle and dev-mock engines still speak the provisional snapshot's flat
 * `ProblemDetails`, because their types describe guard OUTCOMES rather than the
 * wire. Everything the application actually reads lives under `error`, so the
 * conversion happens once, here, at the HTTP boundary — instead of rewriting every
 * problem constructor and every engine-internal assertion.
 *
 * `titleAr`/`detailAr` are DROPPED on purpose: the wire carries an English message,
 * and the UI resolves its Arabic from `code` through the governed table. Keeping the
 * fixture's Arabic in the body would put fixture-authored text on the wire.
 */
export function toWireErrorResponse(
  problem: {
    code: string
    detailAr?: string | null | undefined
    fieldErrors?: ReadonlyArray<{ code: string; field: string; messageAr: string }> | undefined
    status?: number | undefined
    titleAr?: string | undefined
    traceId?: string | undefined
    type?: string | null | undefined
    // The lifecycle problem types carry extra fields (`currentRowVersion`,
    // `policy`, `relatedDocument`, …) that must reach `details`.
    readonly [key: string]: unknown
  },
  status: number,
): HttpResponse<Record<string, unknown>> {
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(problem)) {
    if (key === 'code' || key === 'status' || key === 'fieldErrors') continue
    if (key === 'titleAr' || key === 'detailAr' || key === 'type' || key === 'traceId') continue
    extras[key] = value
  }

  // Field failures travel in `details` as the `Record<path, string[]>` the API emits
  // (`ApiProblemDetails.ToValidationResponse`). The English per-field text is dropped;
  // the UI attaches the approved Arabic for the operation's code to that field name.
  for (const fieldError of problem.fieldErrors ?? []) {
    extras[fieldError.field] = ['invalid']
  }

  return HttpResponse.json(
    {
      success: false,
      error: {
        code: problem.code,
        message: 'The request could not be completed.',
        details: extras,
        request_id:
          problem.traceId === undefined || problem.traceId === ''
            ? 'mock-request-id'
            : problem.traceId,
      },
    },
    { status },
  )
}

/**
 * Drop-in replacement for `HttpResponse.json` that emits the real envelope.
 *
 * Throws on an ambiguous body — one that is neither clearly an error nor
 * clearly a payload — because a wrong guess would make a test assert something
 * the API never sends. Ambiguity here is a fixture bug worth surfacing.
 */
export function apiJson(body: unknown, init?: ResponseInit): HttpResponse<Record<string, unknown>> {
  const status = init?.status

  if (isErrorStatus(status) || looksLikeProblemDetails(body)) {
    if (!isRecord(body)) {
      throw new Error(
        `apiJson: a non-2xx response needs an object body describing the error, received ${typeof body}.`,
      )
    }
    return HttpResponse.json(
      errorEnvelope(codeFor(body), messageFor(body), body['details'], body['fieldErrors']),
      { ...init, status: status ?? 500 },
    )
  }

  if (isRecord(body) && ('success' in body || 'pagination' in body)) {
    // Already an envelope — a fixture is composing one by hand. Pass it through
    // rather than double-wrapping, which would hide the mistake.
    return HttpResponse.json(body, init)
  }

  return HttpResponse.json(successEnvelope(body, null), init)
}
