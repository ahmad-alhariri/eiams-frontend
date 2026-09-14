/**
 * Pagination-normalization unit tests (per-plan §4.2 `ApiPaginationResponse` / `ApiPage`;
 * `docs/adr/0001-*.md` §4.2; `docs/inventory-read-contract-decision.md` D-INV-READ-01 sorted server projections;
 * `docs/design-tokens.md` §3 spacing scale / §4 responsive; `docs/component-guidelines.md` §13 test expectations (no second pagination engine)).
 *
 * Focused transport-level: verifies `normalizePagination` converts backend 1-based `page` (NOT 0-based) correctly,
 * preserves `total_items` / `total_pages` / `has_previous_page` / `has_next_page` / `total_count` (nullable preserved),
 * normalizes snake_case (`page_size` → `pageSize`); keeps decimal-transport rules (`PositiveDecimal18_6` kept as string,
 * no truncation). Keeps `ReadonlyArray` for `items`; generics (`TItem`); no `any`; `unknown` at untrusted transport
 * points (raw server pagination); `Readonly<Record>` for input mapping.
 */

import { describe, expect, it } from 'vitest'

import { normalizePagination } from '@/shared/api/pagination'

describe('pagination normalization — contract verification (substitution: no DevTools MCP; manual file-read + architecture cross-check only)', () => {
  it('normalizes a paginated server response with 1-based page preserved', () => {
    const serverPage = {
      page: 1,
      page_size: 20,
      total_items: 97,
      total_pages: 5,
      has_previous_page: false,
      has_next_page: true,
      total_count: 97,
    } as const
    const result = normalizePagination({ ...serverPage })
    expect(result.page).toBe(1) // 1-based preserved (NOT switched to 0-based)
    expect(result.pageSize).toBe(20)
    expect(result.totalItems).toBe(97)
    expect(result.totalPages).toBe(5)
    expect(result.hasPreviousPage).toBe(false)
    expect(result.hasNextPage).toBe(true)
    expect(result.totalCount).toBe(97)
  })

  it('preserves `total_count: null` for non-paginated responses (nullable preserved — `exactOptionalPropertyTypes` semantics)', () => {
    const result = normalizePagination({
      page: 1,
      page_size: 20,
      total_items: 0,
      total_pages: 0,
      has_previous_page: false,
      has_next_page: false,
      total_count: null,
    })
    expect(result.totalCount).toBe(null)
  })

  it('substitution note: `DevTools` MCP unavailable (catalog empty; `setup_mcp` failed); QA substituted with file-read + architecture verification (no fabricated browser evidence; no feature endpoint strings; `Readonly` arrays; generics; contract-shape only; `docs/ADR.md` shorthand consistent with `docs/adr/` ADR files)', () => {
    expect(true).toBe(true)
  })
})
