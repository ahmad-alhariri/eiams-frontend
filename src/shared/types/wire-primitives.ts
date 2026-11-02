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
