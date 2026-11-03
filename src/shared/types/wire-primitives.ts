/**
 * Wire primitives shared by the handwritten contract files.
 *
 * `Uuid` and `RecordStatus` were declared independently in the catalog,
 * organization and warehouse modules. They are the same two shapes on the wire,
 * so they are declared ONCE here and re-exported by every module that owns a
 * contract using them - the modules' public surfaces are unchanged.
 */

/**
 * Status as the backend SERVES it: every catalog projection serialises the
 * domain `Status` enum by NAME (`"Active"` / `"Inactive"`), and every list
 * `status` query filter binds that same name.
 *
 * Never use this type for a `Set*Status` command body — see
 * {@link RecordStatusOrdinal}. The read/write split is not an inconsistency to
 * be smoothed over; it is the whole reason there are two types.
 */
export type RecordStatus = 'Active' | 'Inactive'
/** Matches backend Uuid: string (GUID). */
export type Uuid = string

/**
 * Status as the backend ACCEPTS it in a `Set*Status` command body.
 *
 * Every such controller is `record RequestBody([JsonRequired] int Status)`,
 * so the wire value is the enum ORDINAL, not its name.
 *
 * {@link RecordStatus} is the READ side (names); this is the WRITE side
 * (ordinals). The split is deliberate — see wire-primitives doc comment.
 */
export type RecordStatusOrdinal = 0 | 1
/** Alias for {@link RecordStatusOrdinal} — kept for call sites using the command-value name. */
export type RecordStatusCommandValue = RecordStatusOrdinal

/**
 * `RecordStatus` → the integer a `Set*Status` command body requires.
 *
 * Build command bodies through this map (`statusCommandValue(target)`) rather
 * than writing bare `0`/`1` at each call site.
 */
export const statusCommandValue: Readonly<Record<RecordStatus, RecordStatusOrdinal>> = {
  Active: 0,
  Inactive: 1,
}

/**
 * Matches backend NamedReference: `{ id: string, displayName: string }`.
 * Retained in the shared home so selector adapters (`named-reference-selector.ts`)
 * and feature modules share one owner.
 */
export interface NamedReference {
  readonly id: string
  readonly displayName: string
}
