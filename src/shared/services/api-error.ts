import axios from 'axios'

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
  'auth.scope_not_available': {
    titleAr: 'النطاق المحدد غير متاح لك.',
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

function safeErrorCode(value: unknown): string | null {
  const code = nonEmptyString(value)
  return code !== null && /^[a-z][a-z0-9._-]{0,127}$/u.test(code) ? code : null
}

function toFieldError(value: unknown): FieldError | null {
  if (!isRecord(value)) {
    return null
  }

  const field = nonEmptyString(value['field'])
  const code = nonEmptyString(value['code'])
  const messageAr = nonEmptyString(value['messageAr'])

  return field !== null && code !== null && messageAr !== null ? { field, code, messageAr } : null
}

function fieldErrors(value: unknown): readonly FieldError[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const fieldError = toFieldError(item)
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

function fallbackApiError(status: number, payload: unknown): ApiError {
  const code = isRecord(payload) ? safeErrorCode(payload['code']) : null
  const feedback = fallbackFeedback(status, code)

  return {
    kind: 'problem',
    status,
    code,
    ...feedback,
    traceId: null,
    fieldErrors: [],
  }
}

function problemFromPayload(payload: unknown, status: number): ApiError | null {
  if (!isRecord(payload) || payload['status'] !== status) {
    return null
  }

  const code = safeErrorCode(payload['code'])
  const titleAr = nonEmptyString(payload['titleAr'])
  const traceId = nonEmptyString(payload['traceId'])

  if (code === null || titleAr === null || traceId === null) {
    return null
  }

  return {
    kind: 'problem',
    status,
    code,
    titleAr,
    detailAr: nonEmptyString(payload['detailAr']),
    traceId,
    fieldErrors: fieldErrors(payload['fieldErrors']),
  }
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

  return (
    problemFromPayload(response.data, response.status) ??
    fallbackApiError(response.status, response.data)
  )
}
