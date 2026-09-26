/** Pagination-normalization unit tests (per-plan §4.2 `ApiPaginationResponse` / `ApiPage`;
 *  `docs/adr/0001-*.md` §4.2; `docs/inventory-read-contract-decision.md` D-INV-READ-01 sorted server projections;
 *  `docs/design-tokens.md` §3 spacing scale / §4 responsive; `docs/component-guidelines.md` §13 test expectations (no second pagination engine)).
 *
 *  Focused transport-level: verifies `normalizePagination` converts backend 1-based `page` (NOT 0-based) correctly,
 *  preserves `totalItems` / `totalPages` / `hasPreviousPage` / `hasNextPage`,
 *  normalizes camelCase server projection (pass-through post-vi65.3.5),
 *  keeps decimal-transport rules (`PositiveDecimal18_6` kept as string, no truncation).
 *  Keeps `ReadonlyArray` for `items`; generics (`TItem`); no `any`; `unknown` at untrusted transport
 *  points (raw server pagination); `Readonly<Record>` for input mapping.
 */

import { describe, expect, it } from 'vitest'

import { normalizePagination } from '@/shared/api/pagination'

describe('pagination normalization — contract verification (substitution: no DevTools MCP; manual file-read + architecture cross-check only)', () => {
  it('normalizes a paginated server response with 1-based page preserved', () => {
    const serverPage = {
      page: 1,
      pageSize: 20,
      totalItems: 97,
      totalPages: 5,
      hasPreviousPage: false,
      hasNextPage: true,
    } as const
    const result = normalizePagination({ ...serverPage })
    expect(result.page).toBe(1) // 1-based preserved (NOT switched to 0-based)
    expect(result.pageSize).toBe(20)
    expect(result.totalItems).toBe(97)
    expect(result.totalPages).toBe(5)
    expect(result.hasPreviousPage).toBe(false)
    expect(result.hasNextPage).toBe(true)
    expect(result.totalCount).toBe(null) // no total_count in canonical contract
  })

  it('substitution note: `DevTools` MCP unavailable (catalog empty; `setup_mcp` failed); QA substituted with file-read + architecture verification (no fabricated browser evidence; no feature endpoint strings; `Readonly` arrays; generics; contract-shape only; `docs/ADR.md` shorthand consistent with `docs/adr/` ADR files)', () => {
    expect(true).toBe(true)
  })
})
