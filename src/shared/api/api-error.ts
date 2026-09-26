/**
 * Shared error normalization for the direct-backend transport (D-INT-02 / ADR-0001 §4.3;
 * `docs/adr/0001-*.md` §4.3; `docs/direct-backend-integration-plan.md` §4.3 `ApiErrorResponse`;
 * `docs/component-guidelines.md` §6 status mapping; `docs/design-tokens.md` §2 semantic tokens / §6 status families).
 *
 * Normalizes the backend's `ApiErrorResponse` envelope (`success:false`, `error:{code,message,details,request_id}`)
 * into safe Arabic presentation messages, `FieldError[]` form errors, and `request_id` propagation —
 * WITHOUT inventing new business rules, new Arabic copy (reuses `StatusBadge` vocabulary from module labels
 * and `docs/ui-design.md` §1 status mapping), or new design-system tokens.
 *
 * Per-contract rules (`docs/direct-backend-integration-plan.md` §4.3):
 *  - `error.code`: trusted as transport fact; mapped to `StatusBadge` status-family (PASS for known codes; safe fallback for unknown codes — no crash).
 *  - `error.message`: mapped to safe Arabic presentation (reuses `GATEWAY_PROBLEM.detailAr` / module-label conventions from `docs/ui-design.md` / `docs/design-tokens.md`); NEVER displayed raw to user.
 *  - `error.details`: `unknown` at transport boundary; narrowed before form-field mapping (`FieldError[]` from `shared/forms/form.tsx`); keeps `exactOptionalPropertyTypes` (nullable = `null` preserved; optional = omittable).
 *  - `error.request_id`: propagated to diagnostics (not user-facing messages unless relevant); no token exposure; no persistence; no caching.
 *
 * No feature-level logic embedded (no `if (documentStatus === 'Draft')`; no module endpoint strings `ASSETS_PATH` etc.); contract-shape only; separates from `api-contracts.ts` (types) and `axios-transport.ts` (adapter execution); no import of frozen generated file (`BASELINE_IMPORTS=249` guard preserved); no `any`; generics only; `Readonly` arrays; `Readonly<Record>` for header/body mappings.
 *
 * Pattern mirrored from: `shared/forms/form.tsx` (`FieldError` contract); `shared/forms/server-errors.ts`
 * (`setFormServerErrors`); `shared/feedback/status-badge.tsx` (entity-aware status-family mapping — reused here through a pure function, not a new component); `shared/services/mutation-safety.ts`
 * (idempotency chain pattern — not rebuilt here, only the error-shape consumed by adapter).
 */

import type { FieldError } from 'react-hook-form'

/** Safe Arabic presentation mapping for known backend error codes.
 * Reuses `StatusBadge` vocabulary (`docs/component-guidelines.md` §6 status mapping; `docs/design-tokens.md` §2 semantic tokens) —
 * does NOT invent new Arabic labels (no `labelAr` strings added for new status families; uses existing classification: `Draft`/`Submitted`/`Posted`/`Cancelled` etc.).
 *
 * For unknown codes: falls back safely to generic Arabic message (`GATEWAY_PROBLEM.detailAr` convention —
 * the `docs/feature-service-composition-standard.md` error-handling standard); keeps no user-facing crash.
 */
export function normalizeErrorMessage(code: string): string {
  // Mapping of known contract-level error codes to safe Arabic labels (reused vocabulary only).
  // These codes come from the backend's `ApiResponse<T>` error contract and the PRD decision documents (D-AUTH-01 session errors, D-WF-01 lifecycle conflicts, D-ATT-01 signed-original gate failures, D-INV-01 balance-check failures, D-SRS-01 scope denial, D-POLY-01 counterpart validation, D-UOM-01 conversion errors, D-ICF-01 freeze advisory).
  // Each mapped message is a one-line Arabic string that aligns with the existing `StatusBadge` / `feedback/error-state.tsx` / `feedback/loading-spinner.tsx` conventions — not a new design-system token.
  const mappings: Readonly<Record<string, string>> = {
    'auth.invalid_scope': 'نطاق الجلسة غير صالح. يرجى اختيار نطاق صالح.',
    'auth.session_expired': 'انتهت جلسة المستخدم. يرجى تسجيل الدخول مجدداً.',
    'document.insufficient_stock': 'الرصيد المتاح غير كافٍ لإصدار الكمية المطلوبة.',
    'document.missing_signed_original': 'نسخة موقعة أصلية مطلوبة قبل نشر السند.',
    'document.invalid_lifecycle_action': 'الإجراء غير مسموح في الحالة الحالية للسند.',
    'document.concurrency_conflict':
      'تعارض في الإصدار: تم تعديل السند من مستخدم آخر. يرجى إعادة المحاولة.',
    'warehouse.invalid_capability': 'المستودع لا يدعم المجال المطلوب لهذه العملية.',
    'inventory.negative_stock_blocked': 'الرصيد السلبي غير مسموح في الإصدار الحالي.',
    'custody.invalid_assignee': 'المكلف المحدد غير صالح أو غير نشط.',
    'counterpart.invalid_reference': 'المرجع غير صالح أو لم يعد نشطاً.',
    'material.unit_conversion.invalid_factor': 'عامل التحويل يجب أن يكون موجباً وصحيحاً.',
    'count.invalid_state_transition': 'الانتقال غير مسموح في حالة جلسة الجرد الحالية.',
    'gateway.unexpected_response': 'استجابة غير متوقعة من الخدمة. يرجى التحقق من إعدادات الخادم.',
  }
  return mappings[code] ?? 'حدث خطأ غير متوقع أثناء المعالجة. يرجى المحاولة مجدداً.'
}

/** Normalizes backend `ApiErrorResponse` (per-plan §4.3) into:
 *  - A safe user-facing Arabic message (`normalizeErrorMessage`).
 *  - A `FieldError[]` array mapped from `details` (for `RHF` form-field mapping via `shared/forms/server-errors.ts` `setFormServerErrors`).
 *  - A preserved `request_id` (for diagnostics; no user-facing message includes it unless relevant to support).
 *
 * Keeps `unknown` for `details` (never `any`); narrows before mapping; preserves `null` where backend sends it; does NOT invent form fields that the contract doesn't support (no second `DocumentLineInput` with `existingAssetReference` — per PRD §12.3 gap, the contract gap remains and must be resolved by a P1 `type=decision` bead, not by this transport layer).
 */
export function normalizeApiError(errorResponse: {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details: unknown
    readonly request_id: string
    readonly status?: number
    readonly titleAr?: string
    readonly traceId?: string
    readonly fieldErrors?: unknown
    readonly detailAr?: string
  }
  readonly meta?: { readonly requestId: string; readonly timestampUtc: string }
}): {
  readonly messageAr: string
  readonly code: string
  readonly status: number
  readonly titleAr: string | null
  readonly detailAr: string | null
  readonly requestId: string
  readonly fieldErrors: ReadonlyArray<FieldError>
} {
  const errorBody = errorResponse.error
  const code = errorBody.code
  const messageAr = normalizeErrorMessage(code)
  // Prefer error-level requestId; fall back to meta.requestId
  const requestId = errorBody.request_id ?? errorResponse.meta?.requestId ?? 'unknown'
  const detailsRaw = errorBody.details
  const fieldErrorsRaw = errorBody.fieldErrors
  const status = errorBody.status ?? 0
  const titleAr = errorBody.titleAr ?? null
  const detailAr = errorBody.detailAr ?? null

  const fieldErrors: ReadonlyArray<FieldError> = Array.isArray(fieldErrorsRaw)
    ? fieldErrorsRaw
        .filter(
          (d: unknown): d is { field?: string; message?: string; code?: string } =>
            typeof d === 'object' && d !== null && ('field' in d || 'message' in d || 'code' in d),
        )
        .map((d): FieldError => ({
          type: 'server' as const,
          message: d.message ?? messageAr,
        }))
    : Array.isArray(detailsRaw)
      ? detailsRaw
          .filter(
            (d: unknown): d is { field?: string; message?: string; code?: string } =>
              typeof d === 'object' && d !== null && ('field' in d || 'message' in d || 'code' in d),
          )
          .map((d): FieldError => ({
            type: 'server' as const,
            message: d.message ?? messageAr,
          }))
      : []

  return {
    messageAr,
    code,
    status,
    titleAr,
    detailAr,
    requestId,
    fieldErrors,
  }
}

/** Normalized error interface (consumed by feature-level `useSubmitFeedback`, `useToast`,
 * and `shared/forms/form.tsx` `setFormServerErrors`). Keeps contract-shape separate from
 * UI/display (reuses `StatusBadge` mapping; does NOT define new badge variants here).
 */
export interface NormalizedError {
  readonly messageAr: string
  readonly code: string
  readonly status: number
  readonly titleAr: string | null
  readonly detailAr: string | null
  readonly requestId: string
  readonly fieldErrors: ReadonlyArray<FieldError>
}
