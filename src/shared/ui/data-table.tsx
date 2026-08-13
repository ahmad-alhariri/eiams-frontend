import { IconArrowsSort, IconChevronDown, IconChevronUp, IconMinus } from '@tabler/icons-react'
import {
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type ReactTable,
  type RowData,
  type RowSelectionState,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'

import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { TableSkeleton } from '@/shared/feedback/table-skeleton'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { cn } from '@/shared/utils/class-names'

/**
 * Feature set used by every DataTable instance. Column authors must create
 * their column helper against this same features value so sorting/selection
 * options (e.g. `enableSorting`) are part of the column definitions:
 *
 * ```ts
 * const helper = createColumnHelper<typeof dataTableFeatures, Warehouse>()
 * const columns = helper.columns([...])
 * ```
 *
 * Kept at module scope so table instances share one registry (v9 idiom).
 */
const dataTableFeatures = tableFeatures({ rowSelectionFeature, rowSortingFeature })

/** Stable fallback so `data` identity changes never recreate per-render arrays. */
const EMPTY_ROWS: never[] = []

type DataTableSortState = {
  id: string
  direction: 'asc' | 'desc'
}

type DataTableSelectionOptions<T> = {
  rowSelection: RowSelectionState
  onRowSelectionChange: OnChangeFn<RowSelectionState>
  getRowId?: (row: T, index: number) => string
}

type DataTableSortOptions = {
  sortState: DataTableSortState | null
  onSortChange: (next: DataTableSortState | null) => void
}

type DataTableProps<T extends RowData = RowData> = {
  /** v9 column definitions, typically via `createColumnHelper<typeof dataTableFeatures, T>()`. */
  columns: ColumnDef<typeof dataTableFeatures, T, unknown>[]
  /** Server page rows; `undefined` renders the loading skeleton. */
  data: T[] | null | undefined
  isLoading?: boolean
  isError?: boolean
  /** Default 'حدث خطأ'. */
  errorTitle?: string
  /** Default 'تعذر تحميل البيانات. حاول مرة أخرى.'. */
  errorMessage?: string
  onRetry?: () => void
  /** Default 'لا توجد بيانات'. */
  emptyTitle?: string
  /** Default 'لم يتم العثور على سجلات مطابقة.'. */
  emptyDescription?: string
  /** CTA content rendered inside the empty state. */
  emptyAction?: ReactNode
  selection?: DataTableSelectionOptions<T>
  sort?: DataTableSortOptions
  onRowClick?: (row: T) => void
  className?: string
}

/**
 * Server-data-oriented table: renders whatever rows it is given and never
 * fetches, sorts, or paginates client-side — the server owns those via the
 * sort callbacks (sort control UI ships separately).
 *
 * Sort affordance: a column is sortable when its definition has
 * `enableSorting !== false` and an `id`/`accessorKey`. The first click sorts
 * ascending, a second click toggles to descending. There is no clear-to-none
 * state in v1; sort state is fully controlled by the `sort` prop.
 *
 * Row clicks (and clicks inside row children, e.g. checkboxes) bubble to
 * `onRowClick`; this is a v1 limitation rather than an event-target filter.
 *
 * All loading/empty/error states render inside the card surface.
 */
function DataTable<T extends RowData = RowData>({
  className,
  columns,
  data,
  isLoading = false,
  isError = false,
  errorTitle = 'حدث خطأ',
  errorMessage = 'تعذر تحميل البيانات. حاول مرة أخرى.',
  onRetry,
  emptyTitle = 'لا توجد بيانات',
  emptyDescription = 'لم يتم العثور على سجلات مطابقة.',
  emptyAction,
  selection,
  sort,
  onRowClick,
}: DataTableProps<T>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: data ?? EMPTY_ROWS,
    ...(selection
      ? {
          state: { rowSelection: selection.rowSelection },
          onRowSelectionChange: selection.onRowSelectionChange,
          ...(selection.getRowId ? { getRowId: selection.getRowId } : {}),
        }
      : {}),
  })

  const headerGroups = table.getHeaderGroups()
  const headerRows = table.getRowModel().rows
  const cardClassName = cn(
    'overflow-hidden rounded-xl border border-border bg-popover shadow-card',
    className,
  )

  if (isLoading || data === undefined) {
    return (
      <div data-slot="data-table" className={cardClassName}>
        <TableSkeleton columns={columns.length} rows={8} className="border-0 shadow-none" />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-slot="data-table" className={cardClassName}>
        <ErrorState
          title={errorTitle}
          description={errorMessage}
          action={
            onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                إعادة المحاولة
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  if (data === null || data.length === 0) {
    return (
      <div data-slot="data-table" className={cardClassName}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            emptyAction ? <div className="flex justify-center">{emptyAction}</div> : undefined
          }
        />
      </div>
    )
  }

  const hasSelection = selection !== undefined

  function handleSortChange(columnId: string) {
    if (!sort) {
      return
    }
    const active = sort.sortState?.id === columnId
    const direction = active && sort.sortState?.direction === 'asc' ? 'desc' : 'asc'
    sort.onSortChange({ id: columnId, direction })
  }

  return (
    <div data-slot="data-table" className={cardClassName}>
      <div className="w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-primary">
            {headerGroups.map((headerGroup, groupIndex) => (
              <tr key={headerGroup.id}>
                {groupIndex === 0 && hasSelection ? (
                  <th scope="col" className="w-12 px-4 py-3 text-center align-middle">
                    <SelectAllCheckbox table={table} />
                  </th>
                ) : null}
                {headerGroup.headers.map((header) => {
                  const columnDef = header.column.columnDef
                  const hasSortId = columnDef.id != null || 'accessorKey' in columnDef
                  const sortable = Boolean(
                    sort !== undefined && hasSortId && header.column.getCanSort(),
                  )
                  const sortedDirection =
                    sort?.sortState && sort.sortState.id === header.column.id
                      ? sort.sortState.direction
                      : null
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      {...(sortedDirection
                        ? {
                            'aria-sort':
                              sortedDirection === 'asc'
                                ? ('ascending' as const)
                                : ('descending' as const),
                          }
                        : {})}
                      className="border-s border-white/10 px-4 py-3 text-start text-sm font-semibold text-white whitespace-nowrap first:border-s-0"
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSortChange(header.column.id)}
                          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-inherit outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="whitespace-nowrap">
                            <table.FlexRender header={header} />
                          </span>
                          {sortedDirection ? (
                            sortedDirection === 'asc' ? (
                              <IconChevronUp aria-hidden className="size-3.5" />
                            ) : (
                              <IconChevronDown aria-hidden className="size-3.5" />
                            )
                          ) : (
                            <IconArrowsSort aria-hidden className="size-3.5 text-white/60" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {headerRows.map((row) => {
              const selected = hasSelection && row.getIsSelected()
              return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-row-divider transition-colors duration-150 hover:bg-ivory',
                    onRowClick && 'cursor-pointer',
                    selected
                      ? 'border-s-[3px] border-s-forest-light bg-forest/5 hover:bg-forest/5'
                      : 'even:bg-ivory',
                  )}
                >
                  {hasSelection ? (
                    <td className="w-12 px-4 py-3 text-center align-middle">
                      <Checkbox
                        aria-label="تحديد الصف"
                        checked={row.getIsSelected()}
                        onCheckedChange={() => row.toggleSelected()}
                      />
                    </td>
                  ) : null}
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 text-sm text-charcoal align-middle whitespace-nowrap"
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Select-all control for the current server page of rows. */
function SelectAllCheckbox<T extends RowData>({
  table,
}: {
  table: ReactTable<typeof dataTableFeatures, T>
}) {
  const isAllSelected = table.getIsAllPageRowsSelected()
  const isIndeterminate = table.getIsSomePageRowsSelected() && !isAllSelected
  return (
    <Checkbox
      aria-label={isAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
      checked={isAllSelected}
      indeterminate={isIndeterminate}
      onCheckedChange={(next) => table.toggleAllPageRowsSelected(next)}
      className="text-forest data-checked:text-primary-foreground"
    >
      {isIndeterminate ? <IconMinus aria-hidden className="size-3.5" /> : null}
    </Checkbox>
  )
}

// Consumers build columns against the shared features value.
// eslint-disable-next-line react-refresh/only-export-components
export { DataTable, dataTableFeatures, type DataTableProps, type DataTableSortState }
