import { useCallback, useMemo, useState } from 'react'

/** Server-side page sizes offered by list controls (10, 25, 50, 100). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]

export const DEFAULT_PAGE_SIZE: PageSizeOption = 10

export interface ServerPaginationOptions {
  /** First rendered page, 1-based. Defaults to 1. */
  initialPage?: number
  initialPageSize?: PageSizeOption
}

export interface ServerPaginationState {
  /** Current page, 1-based. */
  page: number
  pageSize: number
  /** Zero-based index of the first row on the current page. */
  offset: number
  /**
   * Total number of pages for the given server-side record count. Returns 1
   * when the count is unknown (0 or undefined) so controls can stay enabled.
   */
  pageCount: (recordCount: number | undefined) => number
  /** Navigates to a 1-based page. Pages below 1 are clamped to 1. */
  setPage: (page: number) => void
  /** Changes the page size and resets to the first page. */
  setPageSize: (size: number) => void
  /** Returns to the initial page/size configuration. */
  reset: () => void
}

/**
 * Holds the page/pageSize/offset contract used by server-side list queries.
 * Kept framework-agnostic so both the shared DataTable server controls and
 * plain list pages consume one pagination model.
 */
export function useServerPagination(options: ServerPaginationOptions = {}): ServerPaginationState {
  const { initialPage = 1, initialPageSize = DEFAULT_PAGE_SIZE } = options

  const [page, setPageRaw] = useState(Math.max(1, initialPage))
  const [pageSize, setPageSizeRaw] = useState<number>(initialPageSize)

  const setPage = useCallback((nextPage: number) => {
    setPageRaw(Math.max(1, Math.trunc(nextPage)))
  }, [])

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(Math.max(1, Math.trunc(size)))
    setPageRaw(1)
  }, [])

  const reset = useCallback(() => {
    setPageRaw(Math.max(1, initialPage))
    setPageSizeRaw(initialPageSize)
  }, [initialPage, initialPageSize])

  return useMemo<ServerPaginationState>(
    () => ({
      page,
      pageSize,
      offset: (page - 1) * pageSize,
      pageCount: (recordCount) =>
        recordCount === undefined || recordCount <= 0 ? 1 : Math.ceil(recordCount / pageSize),
      setPage,
      setPageSize,
      reset,
    }),
    [page, pageSize, setPage, setPageSize, reset],
  )
}
