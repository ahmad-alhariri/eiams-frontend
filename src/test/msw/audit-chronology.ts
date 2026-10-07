/**
 * Audit chronology: newest first, with a total tie-break on the immutable id.
 *
 * WHY THIS EXISTS AS A NAMED, EXPORTED COMPARATOR
 * ----------------------------------------------
 * The audit explorer used to return headers in whatever order the fixture list
 * happened to be built. For an append-only ledger read newest-first that is not
 * cosmetic: `occurredAt` is a client-supplied timestamp with millisecond
 * precision, so several actions inside one transaction legitimately share it, and
 * an ordering without a tie-break leaves those rows in an arbitrary — and
 * page-to-page unstable — sequence. Two pages of the same query could then show
 * the same row twice and drop another, which is the specific defect this
 * comparator fixed.
 *
 * The fix is a TOTAL order over two immutable fields, which is exactly what
 * server-side pagination needs: sort by `occurredAt` descending, then by
 * `auditLogId` descending. Both keys are written once and never updated, so the
 * order of the whole ledger is stable for the lifetime of the deployment.
 *
 * WHY THE ID DESCENDS TOO
 * -----------------------
 * Descending on both keys matches "newest first" under either tie-break
 * direction, so either choice produces the same visible chronology; descending
 * keeps one consistent rule ("later key wins") instead of a comparator whose two
 * halves disagree. `localeCompare` is retained from the original fix: `occurredAt`
 * is an ISO-8601 UTC string, so lexicographic order is chronological order.
 *
 * Ported from `src/mocks/handlers.ts` by bead `eiams-frontend-79na` (EPIC G7)
 * so that deleting the dev mock in `eiams-frontend-m4jm` cannot silently
 * resurrect the un-tie-broken ordering.
 */

/** The two immutable fields the audit ledger may be ordered by. */
export interface AuditChronologyKey {
  readonly auditLogId: string
  readonly occurredAt: string
}

/**
 * Newest-first comparator with a stable id tie-break. Suitable directly as an
 * `Array.prototype.sort` comparator.
 */
export function compareAuditLogChronology(a: AuditChronologyKey, b: AuditChronologyKey): number {
  if (a.occurredAt === b.occurredAt) {
    return b.auditLogId.localeCompare(a.auditLogId)
  }
  return b.occurredAt.localeCompare(a.occurredAt)
}

/**
 * Returns a NEW array in reverse chronological order; the input is never
 * mutated, so a handler can sort a filter result it also needs unsorted.
 */
export function sortAuditLogsByChronology<T extends AuditChronologyKey>(logs: readonly T[]): T[] {
  return [...logs].sort(compareAuditLogChronology)
}
