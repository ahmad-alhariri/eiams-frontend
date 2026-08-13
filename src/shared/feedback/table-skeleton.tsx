import type { ComponentProps } from 'react'

import { Skeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/utils/class-names'

type TableSkeletonProps = ComponentProps<'div'> & {
  columns?: number
  rows?: number
}

function TableSkeleton({ className, columns = 5, rows = 8, ...props }: TableSkeletonProps) {
  const columnIndexes = Array.from({ length: columns }, (_, index) => index)
  const rowIndexes = Array.from({ length: rows }, (_, index) => index)

  return (
    <div
      {...props}
      data-slot="table-skeleton"
      role="status"
      aria-label="جاري تحميل الجدول..."
      className={cn(
        'w-full overflow-hidden rounded-xl border border-border bg-popover shadow-card',
        className,
      )}
    >
      <div
        className="grid bg-primary px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {columnIndexes.map((columnIndex) => (
          <Skeleton
            key={columnIndex}
            className="h-4 bg-primary-foreground/20 before:via-primary-foreground/30"
          />
        ))}
      </div>
      <div className="divide-y divide-border">
        {rowIndexes.map((rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-4 px-4 py-3 even:bg-muted/40"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {columnIndexes.map((columnIndex) => (
              <Skeleton key={columnIndex} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { TableSkeleton, type TableSkeletonProps }
