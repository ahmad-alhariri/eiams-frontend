/**
 * Wire pagination boundary (RESOLUTION-017).
 *
 * The UI is one-based everywhere — `useServerPagination` exposes `page` starting
 * at 1, and that is the model every table control and list page speaks. The
 * provisional contract snapshot is zero-based (`PageMeta.pageIndex`, minimum 0),
 * so roughly twenty call sites each hand-rolled `pageIndex: pagination.page - 1`
 * at the service boundary.
 *
 * That arithmetic is the defect RESOLUTION-017 names: a zero-based index
 * scattered across every list page is the kind of conversion that is correct
 * until one site forgets the `- 1` and silently returns the second page for
 * page one. This module is the single place the conversion lives, so the
 * contract question becomes one edit rather than a twenty-file sweep.
 *
 * ## Pending contract confirmation
 *
 * R-017's ratified target is one-based `page`/`pageSize` with
 * `PagedData<T> = { items, pageInfo }`, and the current backend already serves
 * `pagination: { page, page_size, ... }`. The new OpenAPI artifact — which
 * FRONTEND-REQUIRED-CONTRACT-CHANGES requires to be generated from the current
 * checkout and has not been published — decides the final field name and casing.
 *
 * Until it lands, `WIRE_PAGE_FIELD` below is the one constant to change. The
 * translation itself is contract-independent and is already correct.
 */

/** Wire query-parameter name for the requested page. */
export const WIRE_PAGE_FIELD = 'pageIndex' as const

/** Wire query-parameter name for the requested page size. */
export const WIRE_PAGE_SIZE_FIELD = 'pageSize' as const

/**
 * The zero-based page index the provisional contract expects, derived from the
 * one-based page the UI holds.
 *
 * Pages below 1 clamp to 0 rather than sending a negative index.
 */
export function toWirePageIndex(page: number): number {
  return Math.max(0, Math.trunc(page) - 1)
}

/** The one-based page a response's zero-based index denotes. */
export function fromWirePageIndex(pageIndex: number): number {
  return Math.max(1, Math.trunc(pageIndex) + 1)
}

/**
 * Builds the pagination half of a list query, omitting absent values so no
 * `undefined` key reaches the wire.
 *
 * Accepts the one-based `page` used by the UI. A caller still holding a
 * zero-based value must say so explicitly via `pageIndex`, which keeps the two
 * bases from being confused at the same call site.
 */
export function toWirePaginationParams(input: {
  page?: number | undefined
  pageIndex?: number | undefined
  pageSize?: number | undefined
}): Record<string, number> {
  const params: Record<string, number> = {}

  if (input.page !== undefined) {
    params[WIRE_PAGE_FIELD] = toWirePageIndex(input.page)
  } else if (input.pageIndex !== undefined) {
    params[WIRE_PAGE_FIELD] = Math.max(0, Math.trunc(input.pageIndex))
  }

  if (input.pageSize !== undefined) {
    params[WIRE_PAGE_SIZE_FIELD] = Math.max(1, Math.trunc(input.pageSize))
  }

  return params
}
