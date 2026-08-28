import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

import { PAGE_SIZE_OPTIONS, type ServerPaginationState } from '@/shared/hooks/use-server-pagination'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { cn } from '@/shared/utils/class-names'
import { toArabicDigits } from '@/shared/utils/format'

export interface ServerPaginationControlsProps {
  /**
   * Pagination contract — the return value of useServerPagination(). The bar
   * reads page/pageSize/offset, derives the page count with
   * pageCount(totalCount), and navigates through setPage/setPageSize.
   */
  pagination: ServerPaginationState
  /**
   * Total server-side record count for the current filters. `undefined`
   * (query still pending) or 0 hides the "عرض X–Y من Z" range text.
   */
  totalCount: number | undefined
  className?: string
}

/**
 * Formats the "عرض ١–١٠ من ٣٧" window text for the current page.
 */
function formatRangeText(offset: number, pageSize: number, totalCount: number): string {
  const start = Math.min(offset + 1, totalCount)
  const end = Math.min(offset + pageSize, totalCount)
  return `عرض ${toArabicDigits(start)}–${toArabicDigits(end)} من ${toArabicDigits(totalCount)}`
}

/**
 * Server-side pagination controls bar (RTL, Arabic). Previous/next buttons
 * with a page indicator, a page-size selector (10/25/50/100) labeled with
 * Arabic digits, and the "عرض X–Y من Z" range text.
 *
 * Fully driven by the parent's useServerPagination() state — the bar performs
 * no fetching and holds no local state, so it renders identically while a
 * server query is pending.
 */
function ServerPaginationControls({
  className,
  pagination,
  totalCount,
}: ServerPaginationControlsProps) {
  const { page, pageSize, offset, setPage, setPageSize } = pagination
  const totalPages = pagination.pageCount(totalCount)
  const isPrevDisabled = page <= 1
  const isNextDisabled = page >= totalPages
  const hasRangeText = totalCount !== undefined && totalCount > 0

  return (
    <nav
      aria-label="تنقل بين الصفحات"
      data-slot="data-table-server-controls"
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2',
        className,
      )}
    >
      {hasRangeText ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {formatRangeText(offset, pageSize, totalCount)}
        </p>
      ) : (
        <span aria-hidden className="text-sm text-muted-foreground">
          —
        </span>
      )}

      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <Select
          value={String(pageSize)}
          itemToStringLabel={(value) => `عرض ${toArabicDigits(Number(value))} صفاً`}
          onValueChange={(value) => {
            if (value !== null) {
              setPageSize(Number(value))
            }
          }}
        >
          <SelectTrigger aria-label="عدد الصفوف في الصفحة" size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                عرض {toArabicDigits(size)} صفاً
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="الصفحة السابقة"
            disabled={isPrevDisabled}
            onClick={() => setPage(page - 1)}
          >
            <IconChevronRight data-icon="inline-start" aria-hidden className="size-4" />
            السابق
          </Button>
          <span
            aria-live="polite"
            className="min-w-14 text-center text-sm font-medium text-foreground"
          >
            صفحة {toArabicDigits(page)} من {toArabicDigits(totalPages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="الصفحة التالية"
            disabled={isNextDisabled}
            onClick={() => setPage(page + 1)}
          >
            التالي
            <IconChevronLeft data-icon="inline-end" aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </nav>
  )
}

export { ServerPaginationControls }
