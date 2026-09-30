import axios from 'axios'

import { arabicCopyForCode } from '@/shared/api/error-copy-ar'
import { normalizeWireErrorCode, readApiError } from '@/shared/api/envelope'
import type { FieldError } from '@/shared/types/generated/eiams-v1'

export type ApiErrorKind = 'problem' | 'network' | 'unexpected'

export interface ApiError {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string | null
  readonly titleAr: string
  readonly detailAr: string | null
  readonly traceId: string | null
  readonly fieldErrors: readonly FieldError[]
}

type ArabicFeedback = Pick<ApiError, 'titleAr' | 'detailAr'>

const NETWORK_FEEDBACK: ArabicFeedback = {
  titleAr: 'تعذر الاتصال بالخدمة',
  detailAr: 'تحقق من اتصال الشبكة ثم حاول مجدداً.',
}

const UNEXPECTED_FEEDBACK: ArabicFeedback = {
  titleAr: 'حدث خطأ غير متوقع',
  detailAr: 'حاول مرة أخرى، أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
}

const AUTH_FEEDBACK: Readonly<Record<string, ArabicFeedback>> = {
  'auth.invalid_credentials': {
    titleAr: 'بيانات تسجيل الدخول غير صحيحة.',
    detailAr: null,
  },
  'auth.access_expired': {
    titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    detailAr: null,
  },
  'auth.unauthorized': {
    titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    detailAr: null,
  },
  'auth.session_expired': {
    titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    detailAr: null,
  },
  'auth.permission_denied': {
    titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
    detailAr: null,
  },
  'auth.origin_denied': {
    titleAr: 'تعذر إتمام الطلب من هذا المصدر.',
    detailAr: null,
  },
}

const STATUS_FEEDBACK: Readonly<Record<number, ArabicFeedback>> = {
  400: { titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.', detailAr: null },
  401: { titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.', detailAr: null },
  403: { titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.', detailAr: null },
  404: { titleAr: 'لم يتم العثور على البيانات المطلوبة.', detailAr: null },
  409: { titleAr: 'تغيرت البيانات. حدّث الصفحة ثم حاول مجدداً.', detailAr: null },
  413: { titleAr: 'حجم الملف يتجاوز الحد المسموح.', detailAr: null },
  415: { titleAr: 'نوع الملف غير مدعوم.', detailAr: null },
  422: { titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.', detailAr: null },
  429: { titleAr: 'توجد طلبات كثيرة. حاول مجدداً بعد قليل.', detailAr: null },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

// `safeErrorCode` was removed 2026-09-30. It validated a code's CHARACTER SHAPE and
// returned it unchanged, which meant a dot-case code from an older backend and a
// UPPER_SNAKE code from the current one both passed validation while neither matched
// the other. `normalizeWireErrorCode` (from `shared/api/envelope.ts`) replaces it: it
// replicates the backend's own `ApiResults.NormalizeErrorCode` rule
// (`Web.Api/Infrastructure/ApiResults.cs:76-101`) and therefore produces exactly the
// form the `error-copy-ar.ts` table is keyed on. Validation that does not normalise
// is the reason a single string could silently select the wrong Arabic message.

/**
 * Reads one field-error entry from either wire shape.
 *
 * Two producers exist and both are real:
 *  - FluentValidation (`{ name, message }`) — the property path plus an English
 *    message, emitted by the validation filter.
 *  - The legacy snapshot (`{ field, code, messageAr }`) — the shape the
 *    provisional OpenAPI described, kept so an older fixture still resolves.
 *
 * The returned `messageAr` is the APPROVED Arabic for the operation's code, not
 * the wire text: the backend's per-field messages are English and must never be
 * rendered in an Arabic-first UI.
 */
function toFieldError(value: unknown, operationCode: string): FieldError | null {
  if (!isRecord(value)) {
    return null
  }

  const field = nonEmptyString(value['field']) ?? nonEmptyString(value['name'])
  if (field === null) {
    return null
  }

  const code = nonEmptyString(value['code']) ?? operationCode
  const copy = arabicCopyForCode(normalizeWireErrorCode(code))
  const messageAr = copy?.detailAr ?? copy?.titleAr

  return messageAr === null || messageAr === undefined ? null : { field, code, messageAr }
}

function fieldErrors(value: unknown, operationCode: string): readonly FieldError[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const fieldError = toFieldError(item, operationCode)
    return fieldError === null ? [] : [fieldError]
  })
}

function fallbackFeedback(status: number, code: string | null): ArabicFeedback {
  if (code !== null) {
    const authFeedback = AUTH_FEEDBACK[code]
    if (authFeedback !== undefined) {
      return authFeedback
    }
  }

  if (status >= 500) {
    return {
      titleAr: 'تعذر إتمام العملية حالياً.',
      detailAr: 'حاول مجدداً بعد قليل، أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
    }
  }

  return STATUS_FEEDBACK[status] ?? UNEXPECTED_FEEDBACK
}

// `fallbackApiError` and `problemFromPayload` were removed 2026-09-30.
//
// Both read `status`, `code`, `titleAr`, `traceId` and `fieldErrors` from the TOP
// LEVEL of the response body. The backend never puts them there: `code` is nested
// under `error`, `titleAr`/`traceId` are frontend-only concepts that do not exist on
// the wire at all, and `status` lives in the HTTP status line, not the body. So
// `problemFromPayload` returned null on every response, `safeErrorCode` read
// `undefined`, and every error in the application fell through to a generic
// per-status Arabic string. `problemFromWire` replaces both and reads the shape the
// API actually emits.

/**
 * Reads the backend's REAL error envelope and renders Arabic feedback from it.
 *
 * The wire shape is `ApiErrorResponse` (`Web.Api/Infrastructure/ApiContracts.cs:32-38`):
 *
 * ```json
 * {"success":false,
 *  "error":{"code":"USERS_NOT_FOUND","message":"…English…",
 *           "details":{},"request_id":"…"}}
 * ```
 *
 * Three facts drive this function, each verified against the backend source:
 *
 *  1. `code` is NESTED under `error`, never at the top level. `ApiResults.Error`
 *     and `ApiResults.ErrorFromStatusCode` are the only producers
 *     (`ApiResults.cs:55-66`, `:33-49`), and both nest.
 *  2. `code` is UPPER_SNAKE_CASE, normalized server-side by
 *     `ApiResults.NormalizeErrorCode` (`ApiResults.cs:76-101`). The
 *     `error-copy-ar.ts` table is keyed on exactly that form, so the code is
 *     normalized again here only as a defence, never as a translation.
 *  3. `error.message` is ENGLISH, authored in C#. It must never reach a
 *     user-facing field in an Arabic-first UI, so it is deliberately NOT used as
 *     `titleAr`. The Arabic copy is selected by `code` from `error-copy-ar.ts`.
 *
 * The previous implementation read `status`, `titleAr`, `traceId` and `code` from
 * the TOP LEVEL of the payload. None of those exist there, so `problemFromPayload`
 * always returned null, `safeErrorCode` always read `undefined`, and every error in
 * the application degraded to a generic per-status Arabic string — including a
 * wrong password rendering as "you do not have the required permission".
 */
function problemFromWire(payload: unknown, status: number): ApiError {
  const wire = readApiError(payload)
  const code = normalizeWireErrorCode(wire?.code)
  const copy = arabicCopyForCode(code)
  const feedback = copy ?? fallbackFeedback(status, code)

  return {
    kind: 'problem',
    status,
    code,
    titleAr: feedback.titleAr,
    detailAr: feedback.detailAr,
    // The backend emits this on every response (`ApiResults.cs`), and it equals
    // `meta.request_id` on success and `error.request_id` on failure. Surfacing
    // it is what makes a user report actionable in support.
    traceId: wire?.request_id ?? null,
    fieldErrors: detailsToFieldErrors(wire?.details, code ?? 'REQUEST_VALIDATION_FAILED'),
  }
}

/**
 * Reduces a model-binding error path to the form field it belongs to.
 *
 * ASP.NET emits `body.code`, `lines[0].quantity`, and `warehouseId` depending on
 * where the failure was bound. `setFormServerErrors` matches on the form's own
 * field name, so `body.code` would never light up the `code` input and the user
 * would see an empty form with only a toast. Taking the LAST segment of a dotted
 * or indexed path is what makes the mapping usable.
 */
function toFormFieldName(path: string): string {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment.length > 0)

  return segments.at(-1) ?? path
}

/**
 * Extracts per-field validation errors from `error.details`.
 *
 * Two real backend shapes reach this field and both must be tolerated:
 *
 *  - `Record<fieldPath, string[]>` — `ApiProblemDetails.ToValidationResponse`
 *    (`Web.Api/Infrastructure/ApiProblemDetails.cs:18-28`). This is the
 *    model-binding failure path (`REQUEST_VALIDATION_FAILED`, 400).
 *  - `{ errors: [{ name, message }] }` — `CustomResults.Problem` for a
 *    FluentValidation `ValidationError` (`CustomResults.cs:14-16`).
 *
 * A domain error with nothing to report sends `details: {}`, never absent
 * (`ApiResults.cs:65`).
 *
 * This is what `setFormServerErrors` consumes, so before this existed no form could
 * ever show a server-side field error — the mapping produced an empty list for
 * every response.
 *
 * `operationCode` MUST be passed in. `details` is the INNER details map, not an
 * envelope, so reading the code from it (`readApiError(details)?.code`) always
 * returned null and every field error silently fell back to the generic
 * `REQUEST_VALIDATION_FAILED` copy — which is why forms showed "راجع البيانات
 * المدخلة" instead of the specific approved reason for the operation.
 */
function detailsToFieldErrors(details: unknown, operationCode: string): readonly FieldError[] {
  if (Array.isArray(details)) {
    return fieldErrors(details, operationCode)
  }

  if (!isRecord(details)) {
    return []
  }

  // FluentValidation shape: `{ errors: [{ name, message }] }`
  if (Array.isArray(details['errors'])) {
    return fieldErrors(details['errors'], operationCode)
  }

  const wireCode = operationCode
  const copy = arabicCopyForCode(wireCode)
  const messageAr = copy?.detailAr ?? copy?.titleAr ?? null

  if (messageAr === null) {
    return []
  }

  const mapped: FieldError[] = []
  for (const [path, messages] of Object.entries(details)) {
    if (!Array.isArray(messages)) {
      continue
    }
    // The backend's per-field messages are ENGLISH (`ApiProblemDetails.SanitizeMessage`,
    // `ApiProblemDetails.cs:51-61`), and no approved Arabic per-field dictionary exists.
    // Rendering them would put English in an Arabic-first UI — the exact defect this
    // function exists to fix. So the field is identified by its wire path and the
    // APPROVED Arabic for the operation's error code is shown. The specific English
    // string stays available in the support log, correlated by `request_id`.
    mapped.push({ field: toFormFieldName(path), code: wireCode, messageAr })
  }
  return mapped
}

/**
 * Converts unknown transport failures into contract-backed Arabic feedback.
 *
 * This function deliberately has no toast, router, query-cache, or form side
 * effects. A feature boundary chooses whether to show the feedback, map the
 * returned `fieldErrors` through `setFormServerErrors`, or recover from a
 * status/code-specific condition.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return {
      kind: 'unexpected',
      status: null,
      code: null,
      ...UNEXPECTED_FEEDBACK,
      traceId: null,
      fieldErrors: [],
    }
  }

  const response = error.response
  if (response === undefined || !Number.isInteger(response.status)) {
    return {
      kind: 'network',
      status: null,
      code: null,
      ...NETWORK_FEEDBACK,
      traceId: null,
      fieldErrors: [],
    }
  }

  return problemFromWire(response.data, response.status)
}
