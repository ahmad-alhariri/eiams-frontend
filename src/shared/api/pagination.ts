/**
 * Pagination normalization for the direct-backend transport (D-INT-02 / ADR-0001 §4.2,
 * `docs/adr/0001-*.md` §4.2 `ApiPaginationResponse`; `docs/direct-backend-integration-plan.md`
 * §4.2 + §5.2; `docs/inventory-read-contract-decision.md` D-INV-READ-01; `docs/design-tokens.md`
 * §3 spacing scale; `docs/ui-design.md` §3 responsive / §10 accessibility).
 *
 * Converts the backend's 1-based snake_case pagination (`docs/direct-backend-integration-plan.md`
 * §5.2: `page` (1-based index), `page_size`, `total_items`, `total_pages`, `has_previous_page`,
 * `has_next_page`, `total_count`) into the frontend-friendly `ApiPage<TItem>` (from `api-contracts.ts`).
 * Keeps 1-based `page` (NOT switched to 0-based — per `docs/inventory-read-contract-decision.md`
 * sorted server projections); normalizes names (snake_case → camelCase) but does NOT change
 * the pagination math (only normalization, no invention of new pagination logic — per-plan §6
 * retirement of generator artifacts; the pagination semantics are owned by the server).
 *
 * Design-system / architecture rules respected:
 *  - No literal spacing/colors/typography values (file is number-normalization only — per
 *    `docs/design-tokens.md` §4 spacing / `docs/component-guidelines.md` §2 reuse-first).
 *  - No feature-level pagination logic (no `useServerPagination` hook rebuilt; no second
 *    pagination engine created; `shared/hooks/use-server-pagination.ts` reused in features —
 *    this file only normalizes the server projection shape).
 *  - Contract-shape only: separates from `document-transport.ts` service interface (`DocumentService`
 *    handles document-level pagination; this file handles any paginated resource); no duplication.
 *  - `Readonly` arrays preserved (`ReadonlyArray<TItem>` for `ApiPage`); `Readonly<Record>` for
 *    input mapping; optional properties kept (`exactOptionalPropertyTypes`); nullable preserved
 *    (`total_count: number | null` from server); dates as ISO strings (formatted at UI edge per
 *    `docs/design-tokens.md` §4).
 *  - No `any` (only `Readonly` generics); no `fetch`; no `generated` import; no feature endpoint
 *    strings embedded (`/assets/`, etc.); `docs/ADR.md` shorthand reference consistent with
 *    `docs/adr/` ADR files (no contradiction with SAD supersession line or design-system rules).
 */

import type { ApiPaginationResponse } from './api-contracts'

/**
 * Normalized pagination input interface (per-plan §4.2; `docs/direct-backend-integration-plan.md` §5.2).
 * Keeps `page` 1-based (NOT 0-based); normalizes `page_size` → `pageSize`; `total_items` → `totalItems`;
 * `total_pages` preserved; `has_previous_page` / `has_next_page` derived from `page` and `total_pages`
 * (same logic as server provides — no client-side invention of pagination rules); `total_count`
 * preserved as nullable (`null` for non-paginated responses — per-plan §4.2 `total_items: number | null`).
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
 * balance-detail identity `balanceId`; low-stock projection — pagination preserved, not rewritten).
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
