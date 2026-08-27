import { IconLoader2, IconSearch, IconX } from '@tabler/icons-react'
import type { RowData } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'

import { useDebounce } from '@/shared/hooks/use-debounce'
import { type ServerPaginationState } from '@/shared/hooks/use-server-pagination'
import { Button } from '@/shared/ui/button'
import { DataTable, type DataTableProps } from '@/shared/ui/data-table'
import { ServerPaginationControls } from '@/shared/ui/data-table-server-controls'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/utils/class-names'

export interface DataTableServerProps<T extends RowData = RowData> extends Omit<
  DataTableProps<T>,
  'className'
> {
  /** Current 1-based page, mirroring ServerPaginationState.page. */
  page: number
  /** Rows per page, mirroring ServerPaginationState.pageSize. */
  pageSize: number
  /**
   * Total server-side record count for the current filters. `undefined`
   * while the count is pending hides the range text.
   */
  totalCount: number | undefined
  /** Total page count for the current filters, e.g. pagination.pageCount(totalCount). */
  totalPages: number
  /** Navigates to a 1-based page, mirroring ServerPaginationState.setPage. */
  onPageChange: (page: number) => void
  /** Changes rows per page, mirroring ServerPaginationState.setPageSize. */
  onPageSizeChange: (pageSize: number) => void
  /**
   * Controlled search query. Supplying it together with onSearchChange
   * renders the debounced search input above the table.
   */
  searchQuery?: string
  /** Fired with the debounced query once typing settles. */
  onSearchChange?: (query: string) => void
  /** Default 'ابحث عن سجل...'. */
  searchPlaceholder?: string
  className?: string
}

/**
 * Debounced remote-search input. The parent owns the query state through
 * searchQuery/onSearchChange; this input debounces typing (300ms) so list
 * queries are not fired per keystroke. The clear button resets immediately.
 */
function ServerSearchInput({
  isLoading,
  onSearchChange,
  placeholder,
  searchQuery,
}: {
  isLoading: boolean
  onSearchChange: (query: string) => void
  placeholder: string
  searchQuery?: string
}) {
  const [inputValue, setInputValue] = useState(searchQuery ?? '')
  const [previousSearchQuery, setPreviousSearchQuery] = useState(searchQuery)
  const debouncedValue = useDebounce(inputValue)
  const hasQuery = inputValue.length > 0

  // React-documented "adjusting state during render" pattern: keeps the local
  // input in sync when the parent resets the query (e.g. clear-all-filters).
  if (searchQuery !== previousSearchQuery) {
    setPreviousSearchQuery(searchQuery)
    setInputValue(searchQuery ?? '')
  }

  useEffect(() => {
    // Publish the settled query only when the live input has caught up with
    // the debounce — otherwise a just-cleared input would re-fire the stale
    // (pre-clear) query through onSearchChange and re-pin the parent filter.
    if (debouncedValue !== searchQuery && debouncedValue === inputValue) {
      onSearchChange(debouncedValue)
    }
  }, [debouncedValue, inputValue, onSearchChange, searchQuery])

  function handleClear() {
    setInputValue('')
    onSearchChange('')
  }

  return (
    <div data-slot="data-table-server-search" className="relative w-full max-w-80">
      <IconSearch
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="بحث"
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => setInputValue(event.currentTarget.value)}
        className="h-10 ps-9 pe-10"
      />
      {hasQuery ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="مسح البحث"
          onClick={handleClear}
          className="absolute end-1.5 top-1/2 -translate-y-1/2"
        >
          <IconX aria-hidden className="size-4" />
        </Button>
      ) : isLoading ? (
        <IconLoader2
          aria-hidden
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : null}
    </div>
  )
}

/**
 * Server-side list composition: DataTable + debounced remote search +
 * pagination controls. The PARENT owns all data fetching (e.g. TanStack
 * Query) and passes the current page rows, totals, and navigation callbacks;
 * this component never fetches, sorts, or paginates client-side.
 *
 * The pagination props mirror the useServerPagination() state contract, and
 * the component re-bridges them to ServerPaginationControls so pages can use
 * either the hook or any other controlled state owner.
 */
function DataTableServer<T extends RowData = RowData>({
  className,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'ابحث عن سجل...',
  ...tableProps
}: DataTableServerProps<T>) {
  const pagination = useMemo<ServerPaginationState>(
    () => ({
      page,
      pageSize,
      offset: (page - 1) * pageSize,
      // totalPages arrives pre-computed from the parent (fetch owner).
      pageCount: () => totalPages,
      setPage: onPageChange,
      setPageSize: onPageSizeChange,
      reset: () => onPageChange(1),
    }),
    [page, pageSize, totalPages, onPageChange, onPageSizeChange],
  )

  const showSearch = searchQuery !== undefined && onSearchChange !== undefined

  return (
    <div data-slot="data-table-server" className={cn('flex min-w-0 flex-col gap-3', className)}>
      {showSearch ? (
        <ServerSearchInput
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          placeholder={searchPlaceholder}
          isLoading={tableProps.isLoading ?? false}
        />
      ) : null}
      <DataTable {...tableProps} />
      <ServerPaginationControls pagination={pagination} totalCount={totalCount} />
    </div>
  )
}

export { DataTableServer }
