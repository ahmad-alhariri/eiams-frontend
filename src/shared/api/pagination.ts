/** Pagination normalization for the direct-backend transport (D-INT-02 / ADR-0001 §4.2,
 *  `docs/adr/0001-*.md` §4.2 `ApiPaginationResponse`; `docs/direct-backend-integration-plan.md`
 *  §4.2 + §5.2; `docs/inventory-read-contract-decision.md` D-INV-READ-01; `docs/design-tokens.md`
 *  §3 spacing scale; `docs/ui-design.md` §3 responsive / §10 accessibility).
 *
 *  Converts the backend's 1-based camelCase pagination projection (`target-contract-baseline.md` §3.1
 *  and `ApiContracts.cs` `PageInfo`: `page`, `pageSize`, `totalItems`, `totalPages`,
 *  `hasPreviousPage`, `hasNextPage`) into the frontend-friendly `NormalizedPaginationInput`.
 *  Keeps 1-based `page` (NOT switched to 0-based — per `docs/inventory-read-contract-decision.md`
 *  sorted server projections); the server projection already uses camelCase post-vi65.3.5,
 *  so this is a pass-through normalization.
 *
 *  Design-system / architecture rules respected:
 *   - No literal spacing/colors/typography values (file is number-normalization only — per
 *     `docs/design-tokens.md` §4 spacing / `docs/component-guidelines.md` §2 reuse-first).
 *   - No feature-level pagination logic (no `useServerPagination` hook rebuilt; no second
 *     pagination engine created; `shared/hooks/use-server-pagination.ts` reused in features —
 *     this file only normalizes the server projection shape).
 *   - Contract-shape only: separates from `document-transport.ts` service interface (`DocumentService`
 *     handles document-level pagination; this file handles any paginated resource); no duplication.
 *   - `Readonly` arrays preserved; `Readonly<Record>` for input mapping; optional properties kept
 *     (`exactOptionalPropertyTypes`); dates as ISO strings (formatted at UI edge per
 *     `docs/design-tokens.md` §4).
 *   - No `any` (only `Readonly` generics); no `fetch`; no `generated` import; no feature endpoint
 *     strings embedded (`/assets/`, etc.); `docs/ADR.md` shorthand reference consistent with
 *     `docs/adr/` ADR files.
 */

import type { ApiPaginationResponse } from './api-contracts'

/** Normalized pagination input interface (per-plan §4.2; `docs/direct-backend-integration-plan.md` §5.2).
 *  Keeps `page` 1-based (NOT 0-based); `pageSize`/`totalItems`/`totalPages` from server projection;
 *  `hasPreviousPage`/`hasNextPage` from server; `totalCount` is `null` in the canonical contract
 *  (the backend does not emit `total_count` — per `target-contract-baseline.md` §3.1
 *  and `ApiContracts.cs` `PageInfo`).
 */
export interface NormalizedPaginationInput {
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
  readonly hasPreviousPage: boolean
  readonly hasNextPage: boolean
  readonly totalCount: null
}

/** Normalizes a server `ApiPaginationResponse` (1-based camelCase, per-vi65.3.5 contract)
 *  into `NormalizedPaginationInput`.
 *  Per-plan: does NOT invent pagination rules; keeps server semantics; the server projection
 *  already uses the canonical camelCase field names post-vi65.3.5.
 *  Matches `docs/inventory-read-contract-decision.md` D-INV-READ-01 (typed sort/filter parameters;
 *  balance-detail identity `balanceId`; low-stock projection — pagination preserved, not rewritten).
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
    pageSize: serverPagination.pageSize,
    totalItems: serverPagination.totalItems,
    totalPages: serverPagination.totalPages,
    hasPreviousPage: serverPagination.hasPreviousPage,
    hasNextPage: serverPagination.hasNextPage,
    totalCount: null,
  }
}
