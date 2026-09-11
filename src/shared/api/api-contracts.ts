/**
 * Shared handwritten contract-shape types for the direct-backend integration
 * (D-INT-02 / ADR-0001, docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md).
 *
 * These are GENERIC TRANSPORT SEAMS — not feature DTOs, not UI/display models,
 * and NOT derived from `@/shared/types/generated/eiams-v1` (frozen migration
 * scaffolding, deleted at `whhu.5` once import count reaches zero; see
 * `docs/direct-backend-integration-plan.md` §6 retirement sequence).
 *
 * Design rules followed (per SAD §9.1 + ADR-0001 §4.2-4.4):
 *  - Contract-shape types (`ApiResponse<T>`, `ApiPage<T>`, `ResourceIdResponse`)
 *    live in `shared/api/` (this file). UI/display models (`ReceivingInfoFormValues`,
 *    etc.) live in their owning module's `types/` directory — separated by layer.
 *  - No `any`; generics (`Readonly` arrays) only; optional = omittable (`exactOptionalPropertyTypes`);
 *    nullable = JSON `null` preserved; dates remain ISO strings; decimals (`DECIMAL(18,6)`) kept
 *    as `PositiveDecimal18_6` (string transport, numeric display handled by feature adapter).
 *  - No import of the frozen generated file (`BASELINE_IMPORTS=249` guard enforced by
 *    `src/test/no-new-generated-imports.test.ts`); no `fetch` used; no second `AxiosInstance`;
 *    no duplication of existing service interfaces (`document-transport.ts` kept intact).
 *  - No module-specific endpoint strings in this file (`ASSETS_PATH`, `/receiving/suppliers`, etc.)
 *    — only generic contract-shape interfaces. Per-module services (`receiving.service.ts`,
 *    `asset.service.ts`) own module-specific endpoint constants and wire types.
 *
 * Used by: `shared/api/api-transport.ts` (interface definition); `shared/api/axios-transport.ts`
 * (production adapter); `shared/api/pagination.ts` (normalization); `shared/api/api-error.ts`
 * (error-shape normalization); and all feature service files after `whhu.13` migration.
 *
 * Pattern mirrored from: `docs/direct-backend-integration-plan.md` §4.2 (`ApiSuccessResponse`,
 * `ApiPaginationResponse`, `ApiPage`) and §4.3 (`ApiErrorResponse`, `ResourceIdResponse`).
 */

/** The backend's generic success envelope (per `docs/direct-backend-integration-plan.md` §2.1
 *  authority rules 1-5: `{ success: true, data: T, pagination?, meta: { request_id, timestamp } }`).
 *
 * Note: `pagination` and `meta` are server-owned; clients must never invent their own pagination
 * or correlation IDs. `request_id` is propagated by `request-id.ts` (per `docs/direct-backend-integration-plan.md`
 * §11 reliability/observability: "Preserve backend `request_id` through normalized frontend errors").
 */
export interface ApiSuccessResponse<T> {
  readonly success: true
  readonly data: T
  readonly pagination: ApiPaginationResponse | null
  readonly meta: ApiResponseMeta
}

/** The server-computed pagination projection used by `shared/api/pagination.ts`.
 *
 * Matches the backend's 1-based pagination (`docs/direct-backend-integration-plan.md` §5.3):
 * `page` (1-based index), `page_size`, `total_items`, `total_pages`, `has_previous_page`,
 * `has_next_page`, `total_count` (nullable for non-paginated responses).
 *
 * Per-plan normalization (§4.2): the frontend-friendly `ApiPage<T>` (see below) derives
 * `items`, `page`, `pageSize`, `totalItems`, `hasPreviousPage`, `hasNextPage` from this
 * projection — NOT by rewriting backend values.
 */
export interface ApiPaginationResponse {
  readonly page: number
  readonly page_size: number
  readonly total_items: number
  readonly total_pages: number
  readonly has_previous_page: boolean
  readonly has_next_page: boolean
  readonly total_count: number | null
}

/** Normalized page interface consumed by `shared/ui/data-table-server.tsx` and all feature hooks
 * (`useAssetsQuery`, `useDocumentQueries`, etc.) after `whhu.13`.
 *
 * Keeps 1-based `page` (per `docs/direct-backend-integration-plan.md` §5.2 first-base pagination);
 * does NOT switch to 0-based; `items` is a `Readonly` array (same convention as `WarehouseDocumentPage`).
 */
export interface ApiPage<TItem> {
  readonly items: ReadonlyArray<TItem>
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
  readonly hasPreviousPage: boolean
  readonly hasNextPage: boolean
}

/** Backend response meta (used by `request-id.ts` for correlation; never cached with query data).
 *
 * Per-plan (§4.2): `request_id` is preserved for diagnostics; `timestamp` is preserved as ISO
 * string (formatted at UI edge per `design-tokens.md` §4). Neither is a user-facing label
 * (kept out of `StatusBadge` / `EmptyState` / `ErrorState` labels — only used in support/debug views).
 */
export interface ApiResponseMeta {
  readonly request_id: string
  readonly timestamp: string
}

/** Generic error envelope normalization (per `docs/direct-backend-integration-plan.md` §4.3
 * and `docs/feature-service-composition-standard.md` §testing).
 *
 * Normalization rules (follow D-INT-02 / ADR-0001):
 *  - Trust `success: false`, `error.code`, `error.message`, `error.details`, `error.request_id`
 *    as transport facts; never display raw `message` to users (map to Arabic presentation
 *    via `shared/feedback/status-badge.tsx` / `shared/forms/form.tsx` `FieldError` mapping).
 *  - `details` is `unknown` (not `any`) and narrowed before mapping to form fields
 *    (`FieldError[]` shape from `shared/forms/form.tsx`).
 *  - Unknown error codes fall back safely (no crash); only mapped codes show
 *    user-facing Arabic labels (no new strings invented in transport layer —
 *    reuse `StatusBadge` vocabulary, per `component-guidelines.md` §6).
 *  - `GATEWAY_PROBLEM` (non-JSON response, per `shared/services/api.client.ts` §GATEWAY_PROBLEM)
 *    is mapped to `error.code` = `gateway.unexpected_response` (same code); `error.message`
 *    is mapped to safe Arabic fallback (`GATEWAY_PROBLEM.detailAr` already exists); `request_id`
 *    is propagated.
 */
export interface ApiErrorResponse {
  readonly success: false
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details: unknown
    readonly request_id: string
  }
}

/** Minimal resource identity response (mutation return shape per backend contract §2.1). */
export interface ResourceIdResponse {
  readonly id: string
}

/** Contract-shape validation helpers (not feature-level validation — feature-level `zod` schemas
 * live in `src/modules/<m>/schemas/*.schema.ts`, e.g. `receiving-info.schema.ts`).
 *
 * These helpers support TYPE GUARDS only (compile-time + narrow `unknown`); they are NOT
 * runtime form validators (those are handled by `shared/forms/form.tsx` + `zod` in feature modules).
 */
export function isResourceIdResponse(value: unknown): value is ResourceIdResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as ResourceIdResponse).id === 'string'
  )
}
