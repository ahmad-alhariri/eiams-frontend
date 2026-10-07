import { HttpResponse } from 'msw'

import {
  buildErrorEnvelope,
  normalizeErrorDetails,
  resolveWireErrorCode,
} from '@/shared/api/error-envelope'

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
 *
 * What is NOT here any more, and why
 * -----------------------------------
 * `errJson` and `toWireErrorResponse` used to be defined in this file, and the
 * development mock API imported them from here. `src/mocks/**` was
 * application/dev-reachable code and `@/test/**` is test support, so that was
 * an inverted dependency, which `src/test/no-runtime-test-imports.test.ts`
 * (EPIC G7) now forbids in both directions of use. They moved to
 * `@/shared/api/error-envelope` — the layer that owns the envelope SHAPE — and
 * are re-exported below unchanged, so every suite that already imported them
 * from the test tree keeps its existing import. `okJson`, `okPageJson` and
 * `apiJson` stayed: they are test-only fixtures, they need MSW's `HttpResponse`,
 * and nothing outside `src/test/` wanted them. `src/mocks/` itself was deleted
 * in `eiams-frontend-m4jm`, so the inversion no longer has a consumer at all.
 */

export { errJson, toWireErrorResponse } from '@/shared/api/error-envelope'

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

/** True for any status outside 2xx — `apiJson`'s half of the error classifier. */
function isErrorStatus(status: number | undefined): boolean {
  return status !== undefined && (status < 200 || status >= 300)
}

function messageFor(body: Record<string, unknown> | undefined): string {
  const detail = body?.['detailAr']
  return typeof detail === 'string' && detail.trim() !== ''
    ? detail
    : 'The request could not be completed.'
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

/**
 * Drop-in replacement for `HttpResponse.json` that emits the real envelope.
 *
 * Throws on an ambiguous body — one that is neither clearly an error nor
 * clearly a payload — because a wrong guess would make a test assert something
 * the API never sends. Ambiguity here is a fixture bug worth surfacing.
 */
export function apiJson(body: unknown, init?: ResponseInit): HttpResponse<Record<string, unknown>> {
  const status = init?.status

  // An EXPLICIT 2xx status wins over the shape heuristic.
  //
  // `looksLikeProblemDetails` treats a body carrying any of
  // `code`/`titleAr`/`detailAr`/`traceId`/`fieldErrors` as an error. That is a
  // reasonable guess for a status-less call, but several legitimate EIAMS
  // ENTITIES own a business `code` property — `Role.code` is
  // `SYSTEM_ADMIN`, `Permission.code`, `Material.code`. So
  // `apiJson(role, { status: 201 })` was classified as a 2xx SUCCESS body and
  // silently rewritten into an error envelope with `error.code = role.code`,
  // which made `admin.service.test.ts` fail with a resolved value of
  // `undefined` while the transport, the handler and the request body were all
  // correct.
  //
  // The caller stating a 2xx status is a stronger signal than a key-name guess,
  // so the status decides whenever it is present; the shape heuristic only
  // applies when no status was supplied.
  if (status !== undefined && !isErrorStatus(status)) {
    return HttpResponse.json(successEnvelope(body, null), init)
  }

  if (isErrorStatus(status) || looksLikeProblemDetails(body)) {
    if (!isRecord(body)) {
      throw new Error(
        `apiJson: a non-2xx response needs an object body describing the error, received ${typeof body}.`,
      )
    }
    return HttpResponse.json(
      buildErrorEnvelope(
        resolveWireErrorCode(body),
        messageFor(body),
        normalizeErrorDetails(body['details'], body['fieldErrors']),
        body['fieldErrors'],
      ),
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
