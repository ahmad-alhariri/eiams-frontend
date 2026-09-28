import { describe, expect, it } from 'vitest'

import {
  WIRE_PAGE_FIELD,
  WIRE_PAGE_SIZE_FIELD,
  fromWirePageIndex,
  toWirePageIndex,
  toWirePaginationParams,
} from '@/shared/api/pagination'

describe('wire pagination boundary (RESOLUTION-017)', () => {
  describe('toWirePageIndex', () => {
    it('converts the UI one-based page to the contract zero-based index', () => {
      expect(toWirePageIndex(1)).toBe(0)
      expect(toWirePageIndex(2)).toBe(1)
      expect(toWirePageIndex(10)).toBe(9)
    })

    it('clamps rather than sending a negative index', () => {
      expect(toWirePageIndex(0)).toBe(0)
      expect(toWirePageIndex(-5)).toBe(0)
    })

    it('truncates a fractional page', () => {
      expect(toWirePageIndex(3.9)).toBe(2)
    })
  })

  it('round-trips a page through the wire', () => {
    for (const page of [1, 2, 7, 100]) {
      expect(fromWirePageIndex(toWirePageIndex(page))).toBe(page)
    }
  })

  it('reads a zero-based index as the page it denotes', () => {
    expect(fromWirePageIndex(0)).toBe(1)
    expect(fromWirePageIndex(4)).toBe(5)
    expect(fromWirePageIndex(-1)).toBe(1)
  })

  describe('toWirePaginationParams', () => {
    it('derives the wire index from the one-based page', () => {
      expect(toWirePaginationParams({ page: 1, pageSize: 20 })).toEqual({
        [WIRE_PAGE_FIELD]: 0,
        [WIRE_PAGE_SIZE_FIELD]: 20,
      })
    })

    it('omits absent values so no undefined key reaches the wire', () => {
      expect(toWirePaginationParams({})).toEqual({})
      expect(toWirePaginationParams({ pageSize: 10 })).toEqual({ [WIRE_PAGE_SIZE_FIELD]: 10 })
    })

    it('prefers the one-based page when both bases are supplied', () => {
      expect(toWirePaginationParams({ page: 1, pageIndex: 99 })).toEqual({
        [WIRE_PAGE_FIELD]: 0,
      })
    })

    it('clamps the page size to at least one', () => {
      expect(toWirePaginationParams({ page: 1, pageSize: 0 })).toEqual({
        [WIRE_PAGE_FIELD]: 0,
        [WIRE_PAGE_SIZE_FIELD]: 1,
      })
    })
  })
})
