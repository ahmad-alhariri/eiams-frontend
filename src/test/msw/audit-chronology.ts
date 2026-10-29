/**
 * Audit chronology: newest first, with a total tie-break on the immutable id.
 *
 * WHY THIS EXISTS AS A NAMED, EXPORTED COMPARATOR
 * ----------------------------------------------
 * The audit explorer used to return headers in whatever order the fixture list
 * happened to be built. For an append-only ledger read newest-first that is not
 * cosmetic: `createdAtUtc` is a millisecond-precision timestamp, so several
 * actions inside one transaction legitimately share it, and an ordering without
 * a tie-break leaves those rows in an arbitrary — and page-to-page unstable —
 * sequence. Two pages of the same query could then show the same row twice and
 * drop another, which is the specific defect this comparator fixed.
 *
 * The fix is a TOTAL order over two immutable fields, which is exactly what
 * server-side pagination needs: sort by `createdAtUtc` descending, then by `id`
 * descending. Both keys are written once and never updated, so the order of the
 * whole ledger is stable for the lifetime of the deployment.
 *
 * WHY THE ID DESCENDS TOO
 * -----------------------
 * Descending on both keys matches "newest first" under either tie-break
 * direction, so either choice produces the same visible chronology; descending
 * keeps one consistent rule ("later key wins") instead of a comparator whose two
 * halves disagree. `localeCompare` is retained from the original fix:
 * `createdAtUtc` is an ISO-8601 UTC string, so lexicographic order is
 * chronological order.
 *
 * The two keys are named after the LIVE wire (`AuditLogHeader.id` /
 * `AuditLogHeader.createdAtUtc`), never after the frozen snapshot's
 * `auditLogId` / `occurredAt`, which the backend never sends.
 *
 * Ported from `src/mocks/handlers.ts` by bead `eiams-frontend-79na` (EPIC G7)
 * so that deleting the dev mock in `eiams-frontend-m4jm` cannot silently
 * resurrect the un-tie-broken ordering.
 */

/** The two immutable fields the audit ledger may be ordered by. */
export interface AuditChronologyKey {
  readonly id: string
  readonly createdAtUtc: string
}

/**
 * Newest-first comparator with a stable id tie-break. Suitable directly as an
 * `Array.prototype.sort` comparator.
 */
export function compareAuditLogChronology(a: AuditChronologyKey, b: AuditChronologyKey): number {
  if (a.createdAtUtc === b.createdAtUtc) {
    return b.id.localeCompare(a.id)
  }
  return b.createdAtUtc.localeCompare(a.createdAtUtc)
}

/**
 * Returns a NEW array in reverse chronological order; the input is never
 * mutated, so a handler can sort a filter result it also needs unsorted.
 */
export function sortAuditLogsByChronology<T extends AuditChronologyKey>(logs: readonly T[]): T[] {
  return [...logs].sort(compareAuditLogChronology)
}
