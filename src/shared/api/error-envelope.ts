import { normalizeWireErrorCode } from '@/shared/api/envelope'

/**
 * Builders for the REAL backend error envelope.
 *
 * Why this module exists outside `src/test/**`
 * -------------------------------------------
 * Both MSW harnesses need to answer with the envelope the API actually sends
 * (`{"success":false,"error":{"code","message","details","request_id"}}`),
 * because a handler that returns a bare payload lets the whole service layer be
 * wrong about the wire without a single test noticing. That knowledge was
 * written inside `src/test/msw/envelope.ts`, and the development mock API
 * (`src/mocks/handlers.ts`) then imported it from there — an inverted
 * dependency, from application/dev-reachable code into the test-support tree.
 * `src/test/no-runtime-test-imports.test.ts` (EPIC G7) is the machine-enforced
 * half of the rule that forbids it, so the builders had to move somewhere both
 * harnesses may reach.
 *
 * `src/shared/api/` is that somewhere, and it is the only defensible one: this
 * is envelope KNOWLEDGE — the exact shape `envelope.ts` in this same folder
 * parses on the way in — so it belongs beside the code that consumes it rather
 * than in a mock folder that bead `eiams-frontend-vi65.14.6` deletes.
 *
 * The deliberate omission: MSW
 * ----------------------------
 * These return a plain `Response`, NOT `msw`'s `HttpResponse`. `HttpResponse` is
 * a `Response` subclass with no extra behaviour, so every MSW resolver that
 * returns one of these keeps working unchanged; and building it from the
 * platform `Response` is what allows this file to sit in `src/shared/` at all.
 * Importing `msw` here would put the mocking library into the production
 * module graph — the thing `src/test/production-artifact-purity.test.ts` exists
 * to prevent — in exchange for a subclass name.
 *
 * `src/test/msw/envelope.ts` re-exports both builders, so the ~40 suites that
 * import them from the test tree keep their imports unchanged.
 */

/** Correlation id stamped on envelope payloads built by a harness. */
const FIXTURE_REQUEST_ID = 'test-request-id'

/** The wire message when a caller supplies none; never user-facing copy. */
const DEFAULT_WIRE_MESSAGE = 'The request could not be completed.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
export function normalizeErrorDetails(
  details: unknown,
  fieldErrors: unknown,
): Record<string, unknown> {
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

/**
 * Derives a wire-shaped code from a payload.
 *
 * The snapshot's codes were lowerCamel and dotted; the wire is UPPER_SNAKE. A
 * fixture that still uses the old spelling keeps working rather than silently
 * becoming a code the Arabic table has never heard of.
 */
export function resolveWireErrorCode(body: Record<string, unknown> | undefined): string {
  const raw = body?.['code']
  if (typeof raw === 'string' && raw.trim() !== '') {
    return normalizeWireErrorCode(raw) ?? raw
  }
  return typeof body?.['titleAr'] === 'string' ? 'REQUEST_INVALID' : 'REQUEST_FAILED'
}

/**
 * Assembles the nested error envelope from already-normalized parts.
 *
 * Returns a plain record rather than the `ApiErrorResponse` interface because
 * MSW's `HttpResponse.json` is generic over a record body, and the test-side
 * `apiJson` hands this value straight to it.
 */
export function buildErrorEnvelope(
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
      : normalizeErrorDetails(details, fieldErrors)
  return {
    success: false,
    error: {
      code,
      message: titleAr,
      details: detailsValue,
      request_id: FIXTURE_REQUEST_ID,
    },
  }
}

function jsonErrorResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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
): Response {
  // Only an explicit `detail` becomes `details.detail`. The wire `message` is
  // English and stays on the envelope's `message` field: promoting it into
  // details would let `normalizeApiError` use it as a titleAr override and
  // replace the governed Arabic copy with English server text.
  return jsonErrorResponse(
    buildErrorEnvelope(
      resolveWireErrorCode({ code: body?.code }),
      body?.message ?? DEFAULT_WIRE_MESSAGE,
      typeof body?.detail === 'string' && body.detail.trim() !== ''
        ? { detail: body.detail }
        : normalizeErrorDetails(body?.details, body?.fieldErrors),
      body?.fieldErrors,
    ),
    status,
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
): Response {
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

  return jsonErrorResponse(
    {
      success: false,
      error: {
        code: problem.code,
        message: DEFAULT_WIRE_MESSAGE,
        details: extras,
        request_id:
          problem.traceId === undefined || problem.traceId === ''
            ? 'mock-request-id'
            : problem.traceId,
      },
    },
    status,
  )
}
