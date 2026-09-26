/**
 * Shared type contracts for EIAMS frontend.
 *
 * Handwritten to replace the auto-generated bundle.
 * These types are sourced from the backend OpenAPI spec but maintained by hand.
 */

/** Record status — matches backend enum. */
export type RecordStatus = 'Active' | 'Inactive'

/** Field-level error contract (from ProblemDetails.details). */
export interface FieldError {
  readonly code: string
  readonly field: string
  readonly messageAr: string
}

/** A reference carrying only the stable identifiers plus a display name. */
export interface NamedReference {
  readonly code?: string | null
  readonly displayName: string
  readonly id: string
  readonly status?: RecordStatus | null
}
