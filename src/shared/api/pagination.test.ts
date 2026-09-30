/**
 * Pagination request-boundary tests.
 *
 * REWRITTEN 2026-09-30. The previous version asserted `pageIndex: 0` for UI page 1.
 * That test passed, and it was wrong: it encoded the defect it existed to catch.
 *
 * Two independent errors had to be fixed together, and the old test covered neither:
 *
 *  1. WRONG PARAMETER NAME. It asserted the presence of `pageIndex`. The backend binds
 *     `Page` (`PaginationQueryParameters.cs:9-13`, `[Range(1, MaximumPage)]`,
 *     `DefaultPage = 1`). ASP.NET Core query binding is case-insensitive but NOT
 *     name-agnostic, so `pageIndex` matched no property and was silently discarded.
 *     Measured against the live API on 2026-09-29: `pageIndex=0`, `=1` and `=2` each
 *     returned `pagination.page=1`, while `page=1`, `2`, `99` each returned their own
 *     page. Every next-page control was inoperable, silently.
 *
 *  2. WRONG BASE. The zero-based index came from the provisional OpenAPI snapshot, which
 *     `docs/adr/0001-handwritten-contracts-for-direct-backend-integration.md` supersedes.
 *
 * Zero-based `pageIndex` REMAINS the correct UI view-model, because TanStack Table's
 * `pageIndex` is zero-based by definition. So the boundary is: zero-based in, one-based
 * out, under the name the server binds.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_WIRE_PAGE_SIZE,
  WIRE_PAGE_FIELD,
  WIRE_PAGE_SIZE_FIELD,
  toWirePaginationParams,
} from './pagination'

describe('toWirePaginationParams', () => {
  it('sends the parameter name the backend actually binds', () => {
    expect(WIRE_PAGE_FIELD).toBe('page')
    expect(WIRE_PAGE_SIZE_FIELD).toBe('pageSize')
  })

  it('never sends `pageIndex`, which the server silently discards', () => {
    // This is the regression that made every next-page button a no-op: the request
    // was well-formed, the response was a 200, and the page never advanced.
    expect(Object.keys(toWirePaginationParams({ pageIndex: 5, pageSize: 20 }))).not.toContain(
      'pageIndex',
    )
  })

  it('converts the first UI page (0) to the first wire page (1)', () => {
    expect(toWirePaginationParams({ pageIndex: 0 })).toEqual({ page: 1 })
    expect(toWirePaginationParams({ pageIndex: 0, pageSize: 20 })).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('converts each subsequent UI page by exactly one', () => {
    expect(toWirePaginationParams({ pageIndex: 1, pageSize: 20 })).toEqual({
      page: 2,
      pageSize: 20,
    })
    expect(toWirePaginationParams({ pageIndex: 98, pageSize: 20 })).toEqual({
      page: 99,
      pageSize: 20,
    })
  })

  it('is the inverse of the 1-based -> 0-based conversion the list pages perform', () => {
    // `warehouses-list-page.tsx:57` does `pageIndex: currentPage - 1` to hand
    // DataTable's 1-based page to TanStack. A round trip must be the identity.
    for (const currentPage of [1, 2, 3, 50, 99]) {
      const { [WIRE_PAGE_FIELD]: wirePage } = toWirePaginationParams({
        pageIndex: currentPage - 1,
      })
      expect(wirePage).toBe(currentPage)
    }
  })

  it('clamps a negative page to 1 rather than sending an invalid page=0', () => {
    // The backend rejects page=0 with 400 REQUEST_VALIDATION_FAILED.
    expect(toWirePaginationParams({ pageIndex: -1 })).toEqual({ page: 1 })
    expect(toWirePaginationParams({ pageIndex: -5 })).toEqual({ page: 1 })
  })

  it('truncates a fractional page instead of sending 2.7', () => {
    expect(toWirePaginationParams({ pageIndex: 1.7 })).toEqual({ page: 2 })
  })

  it('clamps page size into the backend-accepted 1..100 range', () => {
    expect(toWirePaginationParams({ pageSize: 0 })).toEqual({ pageSize: 1 })
    expect(toWirePaginationParams({ pageSize: 5000 })).toEqual({ pageSize: MAX_WIRE_PAGE_SIZE })
    expect(MAX_WIRE_PAGE_SIZE).toBe(100)
  })

  it('omits absent values so no `undefined` reaches the wire', () => {
    // axios serializes { page: undefined } into the literal query string
    // "page=undefined", which then fails to bind — the same silent page-1 pin.
    expect(toWirePaginationParams({})).toEqual({})
    expect(toWirePaginationParams({ pageIndex: 0 })).not.toHaveProperty(WIRE_PAGE_SIZE_FIELD)
    expect(Object.values(toWirePaginationParams({ pageIndex: 2 }))).not.toContain(undefined)
  })

  it('accepts an explicit undefined without emitting the key', () => {
    expect(toWirePaginationParams({ pageIndex: undefined, pageSize: undefined })).toEqual({})
  })
})
