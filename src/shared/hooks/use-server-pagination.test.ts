import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  useServerPagination,
} from '@/shared/hooks/use-server-pagination'

describe('useServerPagination', () => {
  it('starts at page 1 with the default page size and a zero offset', () => {
    const { result } = renderHook(() => useServerPagination())

    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(result.current.offset).toBe(0)
  })

  it('honors explicit initial page and page size', () => {
    const { result } = renderHook(() =>
      useServerPagination({ initialPage: 3, initialPageSize: 50 }),
    )

    expect(result.current.page).toBe(3)
    expect(result.current.pageSize).toBe(50)
    expect(result.current.offset).toBe(100)
  })

  it('clamps an invalid initial page to 1', () => {
    const { result } = renderHook(() => useServerPagination({ initialPage: -2 }))
    expect(result.current.page).toBe(1)
  })

  it('navigates pages and recalculates the zero-based offset', () => {
    const { result } = renderHook(() => useServerPagination({ initialPageSize: 25 }))

    act(() => result.current.setPage(4))
    expect(result.current.page).toBe(4)
    expect(result.current.offset).toBe(75)
  })

  it('clamps navigation below page 1', () => {
    const { result } = renderHook(() => useServerPagination())

    act(() => result.current.setPage(0))
    expect(result.current.page).toBe(1)
    expect(result.current.offset).toBe(0)
  })

  it('resets to the first page when the page size changes', () => {
    const { result } = renderHook(() =>
      useServerPagination({ initialPage: 5, initialPageSize: 10 }),
    )

    act(() => result.current.setPageSize(100))
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(100)
    expect(result.current.offset).toBe(0)
  })

  it('reset returns to the initial configuration', () => {
    const { result } = renderHook(() =>
      useServerPagination({ initialPage: 2, initialPageSize: 25 }),
    )

    act(() => result.current.setPage(7))
    act(() => result.current.setPageSize(50))
    act(() => result.current.reset())

    expect(result.current.page).toBe(2)
    expect(result.current.pageSize).toBe(25)
  })

  it('pageCount derives the server page count and never returns zero', () => {
    const { result } = renderHook(() => useServerPagination({ initialPageSize: 10 }))

    expect(result.current.pageCount(55)).toBe(6)
    expect(result.current.pageCount(50)).toBe(5)
    expect(result.current.pageCount(0)).toBe(1)
    expect(result.current.pageCount(undefined)).toBe(1)
  })

  it('exposes the fixed server page-size options', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100])
  })
})
