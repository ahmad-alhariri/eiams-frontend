/**
 * Says, in Arabic, that a reference directory does not fit on one page.
 *
 * WHY THIS EXISTS. Several screens load a directory not to page through it but
 * to JOIN a label onto a record that only carries a foreign key — an employee's
 * `orgUnitId` becomes an org-unit name, a warehouse's `siteId` becomes a site
 * name, a new unit's parent becomes a parent option. Those joins are only
 * correct while the loaded slice contains every row.
 *
 * The backend caps `pageSize` at 100, so "load everything" is not available:
 * `pageSize: 200` is either rejected or silently truncated, and a truncated
 * slice does not fail loudly — it renders `—` where a name belongs, or quietly
 * hides the parent a create form needs. The service now clamps the request, so
 * the honest options are to show every row of the first 100 or ADMIT the limit.
 * This component is the admission, and it is what makes `MAX_WIRE_PAGE_SIZE`
 * usable rather than a silent truncation.
 *
 * Rendered only when the server's `total_items` exceeds the rows actually held,
 * so a directory of 12 units shows nothing at all.
 */
export interface ReferenceLimitNoteProps {
  /** Rows the reference query actually holds — `page.items.length`. */
  readonly loadedCount: number | undefined
  /** Rows the server reports in scope — `page.totalItems`. */
  readonly totalCount: number | undefined
  /** Optional Arabic sentence appended after the limit statement. */
  readonly hint?: string
}

export function ReferenceLimitNote({ loadedCount, totalCount, hint }: ReferenceLimitNoteProps) {
  if (loadedCount === undefined || totalCount === undefined || totalCount <= loadedCount) {
    return null
  }

  return (
    <p role="status" className="text-sm text-muted-foreground">
      يعرض النظام أول {loadedCount} عنصراً من أصل {totalCount}
      {hint === undefined ? '.' : ` — ${hint}`}
    </p>
  )
}
