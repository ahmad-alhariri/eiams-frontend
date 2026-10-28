/**
 * Pagination request-boundary tests.
 *
 * REWRITTEN 2026-09-30, again 2026-10-27. The previous version asserted
 * `pageIndex: 0` for UI page 1. That test passed, and it was wrong: it encoded
 * the defect it existed to catch.
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
 * The zero-based helper is now DELETED, so a caller that still thinks in
 * `pageIndex` fails to compile instead of quietly sending `page=0`.
 * The boundary is therefore ONE convention: a ONE-based page in, a ONE-based `page` out,
 * under the name the server binds.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_WIRE_PAGE_SIZE,
  WIRE_PAGE_FIELD,
  WIRE_PAGE_SIZE_FIELD,
  toWireOneBasedPaginationParams,
} from './pagination'

describe('toWireOneBasedPaginationParams', () => {
  it('sends the parameter name the backend actually binds', () => {
    expect(WIRE_PAGE_FIELD).toBe('page')
    expect(WIRE_PAGE_SIZE_FIELD).toBe('pageSize')
  })

  it('never sends `pageIndex`, which the server silently discards', () => {
    // This is the regression that made every next-page button a no-op: the request
    // was well-formed, the response was a 200, and the page never advanced.
    expect(Object.keys(toWireOneBasedPaginationParams({ page: 5, pageSize: 20 }))).not.toContain(
      'pageIndex',
    )
  })

  it('passes the one-based page through unchanged', () => {
    expect(toWireOneBasedPaginationParams({ page: 1 })).toEqual({ page: 1 })
    expect(toWireOneBasedPaginationParams({ page: 2, pageSize: 20 })).toEqual({
      page: 2,
      pageSize: 20,
    })
    expect(toWireOneBasedPaginationParams({ page: 99, pageSize: 20 })).toEqual({
      page: 99,
      pageSize: 20,
    })
  })

  it('clamps a page of 0 to 1 rather than sending the invalid page=0', () => {
    // The backend rejects page=0 with 400 REQUEST_VALIDATION_FAILED:
    // `details.Page = ["The field Page must be between 1 and 21474836."]`.
    expect(toWireOneBasedPaginationParams({ page: 0 })).toEqual({ page: 1 })
    expect(toWireOneBasedPaginationParams({ page: -1 })).toEqual({ page: 1 })
    expect(toWireOneBasedPaginationParams({ page: -5 })).toEqual({ page: 1 })
  })

  it('truncates a fractional page instead of sending 2.7', () => {
    expect(toWireOneBasedPaginationParams({ page: 2.7 })).toEqual({ page: 2 })
  })

  it('clamps page size into the backend-accepted 1..100 range', () => {
    expect(toWireOneBasedPaginationParams({ pageSize: 0 })).toEqual({ pageSize: 1 })
    expect(toWireOneBasedPaginationParams({ pageSize: 5000 })).toEqual({
      pageSize: MAX_WIRE_PAGE_SIZE,
    })
    expect(MAX_WIRE_PAGE_SIZE).toBe(100)
  })

  it('omits absent values so no `undefined` reaches the wire', () => {
    // axios serializes { page: undefined } into the literal query string
    // "page=undefined", which then fails to bind — the same silent page-1 pin.
    expect(toWireOneBasedPaginationParams({})).toEqual({})
    expect(toWireOneBasedPaginationParams({ page: 1 })).not.toHaveProperty(WIRE_PAGE_SIZE_FIELD)
    expect(Object.values(toWireOneBasedPaginationParams({ page: 2 }))).not.toContain(undefined)
  })

  it('accepts an explicit undefined without emitting the key', () => {
    expect(toWireOneBasedPaginationParams({ page: undefined, pageSize: undefined })).toEqual({})
  })
})
