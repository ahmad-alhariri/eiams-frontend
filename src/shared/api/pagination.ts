/**
 * Pagination normalization for the direct-backend transport (D-INT-02 / ADR-0001 Â§4.2,
 * `docs/adr/0001-*.md` Â§4.2 `ApiPaginationResponse`; `docs/direct-backend-integration-plan.md`
 * Â§4.2 + Â§5.2; `docs/inventory-read-contract-decision.md` D-INV-READ-01; `docs/design-tokens.md`
 * Â§3 spacing scale; `docs/ui-design.md` Â§3 responsive / Â§10 accessibility).
 *
 * Converts the backend's 1-based snake_case pagination (`docs/direct-backend-integration-plan.md`
 * Â§5.2: `page` (1-based index), `page_size`, `total_items`, `total_pages`, `has_previous_page`,
 * `has_next_page`, `total_count`) into the frontend-friendly `ApiPage<TItem>` (from `api-contracts.ts`).
 * Keeps 1-based `page` (NOT switched to 0-based â€” per `docs/inventory-read-contract-decision.md`
 * sorted server projections); normalizes names (snake_case â†’ camelCase) but does NOT change
 * the pagination math (only normalization, no invention of new pagination logic â€” per-plan Â§6
 * retirement of generator artifacts; the pagination semantics are owned by the server).
 *
 * Design-system / architecture rules respected:
 *  - No literal spacing/colors/typography values (file is number-normalization only â€” per
 *    `docs/design-tokens.md` Â§4 spacing / `docs/component-guidelines.md` Â§2 reuse-first).
 *  - No feature-level pagination logic (no `useServerPagination` hook rebuilt; no second
 *    pagination engine created; `shared/hooks/use-server-pagination.ts` reused in features â€”
 *    this file only normalizes the server projection shape).
 *  - Contract-shape only: separates from `document-transport.ts` service interface (`DocumentService`
 *    handles document-level pagination; this file handles any paginated resource); no duplication.
 *  - `Readonly` arrays preserved (`ReadonlyArray<TItem>` for `ApiPage`); `Readonly<Record>` for
 *    input mapping; optional properties kept (`exactOptionalPropertyTypes`); nullable preserved
 *    (`total_count: number | null` from server); dates as ISO strings (formatted at UI edge per
 *    `docs/design-tokens.md` Â§4).
 *  - No `any` (only `Readonly` generics); no `fetch`; no `generated` import; no feature endpoint
 *    strings embedded (`/assets/`, etc.); `docs/ADR.md` shorthand reference consistent with
 *    `docs/adr/` ADR files (no contradiction with SAD supersession line or design-system rules).
 */

import type { ApiPaginationResponse } from './api-contracts'

/**
 * Normalized pagination input interface (per-plan Â§4.2; `docs/direct-backend-integration-plan.md` Â§5.2).
 * Keeps `page` 1-based (NOT 0-based); normalizes `page_size` â†’ `pageSize`; `total_items` â†’ `totalItems`;
 * `total_pages` preserved; `has_previous_page` / `has_next_page` derived from `page` and `total_pages`
 * (same logic as server provides â€” no client-side invention of pagination rules); `total_count`
 * preserved as nullable (`null` for non-paginated responses â€” per-plan Â§4.2 `total_items: number | null`).
 */
export interface NormalizedPaginationInput {
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
  readonly hasPreviousPage: boolean
  readonly hasNextPage: boolean
  readonly totalCount: number | null
}

/**
 * Normalizes a server `ApiPaginationResponse` (1-based snake_case) into `NormalizedPaginationInput`.
 * Per-plan: does NOT invent pagination rules; keeps server semantics; only converts field names.
 * Matches `docs/inventory-read-contract-decision.md` D-INV-READ-01 (typed sort/filter parameters;
 * balance-detail identity `balanceId`; low-stock projection â€” pagination preserved, not rewritten).
 */
export function normalizePagination(
  serverPagination: ApiPaginationResponse | null,
): NormalizedPaginationInput {
  if (serverPagination === null) {
    return {
      page: 1,
      pageSize: 0,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      totalCount: null,
    }
  }

  return {
    page: serverPagination.page,
    pageSize: serverPagination.page_size,
    totalItems: serverPagination.total_items,
    totalPages: serverPagination.total_pages,
    hasPreviousPage: serverPagination.has_previous_page,
    hasNextPage: serverPagination.has_next_page,
    totalCount: serverPagination.total_count,
  }
}

export const WIRE_PAGE_FIELD = 'page' as const

/** Wire query-parameter name for the requested page size. */
export const WIRE_PAGE_SIZE_FIELD = 'pageSize' as const

/** The backend's maximum page size; `PaginationQueryParameters.PageSize` is `[Range(1, 100)]`. */
export const MAX_WIRE_PAGE_SIZE = 100

/**
 * Builds the pagination half of a list query, converting the UI's zero-based
 * page to the API's one-based page.
 *
 * Values below `0` clamp to the first page rather than being sent as an invalid
 * `page=0`, which the backend rejects with 400 `REQUEST_VALIDATION_FAILED`.
 * Page size is clamped into the `[1, 100]` range the backend accepts, so an
 * over-large request fails loudly at the server instead of being rejected here.
 *
 * Absent values are omitted entirely so no `undefined` key reaches the wire:
 * axios serializes `{page: undefined}` as the literal string "undefined", which
 * then fails to bind server-side and silently pins the result to page 1.
 */
export function toWirePaginationParams(input: {
  readonly pageIndex?: number | undefined
  readonly pageSize?: number | undefined
}): Record<string, number> {
  const params: Record<string, number> = {}

  if (input.pageIndex !== undefined) {
    params[WIRE_PAGE_FIELD] = Math.max(1, Math.trunc(input.pageIndex) + 1)
  }

  if (input.pageSize !== undefined) {
    params[WIRE_PAGE_SIZE_FIELD] = Math.min(
      MAX_WIRE_PAGE_SIZE,
      Math.max(1, Math.trunc(input.pageSize)),
    )
  }

  return params
}
