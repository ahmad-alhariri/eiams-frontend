/**
 * Maps query states into the tri-state `data` prop shared by DataTable and
 * DataTableServer: `undefined` while loading, `null` after an error (the table
 * renders its error state), or the rows otherwise.
 */

export function pageRows<Row>(
  page: Readonly<{ items: readonly Row[] }> | undefined,
  isError: boolean,
): Row[] | null | undefined {
  if (page === undefined) {
    return isError ? null : undefined
  }

  return [...page.items]
}

export function listRows<Row>(
  data: readonly Row[] | undefined,
  isError: boolean,
): Row[] | null | undefined {
  if (data === undefined) {
    return isError ? null : undefined
  }

  return [...data]
}
