/**
 * Canonical warehouse-document action vocabulary (`eiams-frontend-whhu.19`).
 *
 * ## Why this exists
 *
 * `Application.WarehouseDocuments.GetPolicy` serialises the action codes as
 * bare strings (`DocumentActionAvailabilityResponse.Action`, and the private
 * `Edit`/`Submit`/... constants in the policy handler), so the wire type in
 * `document-wire.types.ts` correctly declares `action: string`. The frontend
 * nevertheless needs the closed set: it keys Arabic labels, button variants and
 * permission codes off the action, and a `string` would silently fall back to a
 * generic label for an action nobody has ever seen.
 *
 * The snapshot used to supply that union as `DocumentActionType`. That import is
 * gone from this directory (zero generated imports under `src/shared/documents/`),
 * so the vocabulary lives here — next to the wire contract it narrows.
 *
 * The nine values are exactly the nine the backend policy handler evaluates.
 * `toDocumentActionType` is the only honest way to turn a wire string into one
 * of them: an unrecognised code is `null`, never a silent fallback, because
 * rendering a button the server never offered is worse than rendering none.
 */
export const DOCUMENT_ACTION_TYPES = [
  'Edit',
  'Submit',
  'Post',
  'Reject',
  'Revise',
  'Cancel',
  'Reverse',
  'UploadAttachment',
  'DeleteAttachment',
] as const

export type DocumentActionType = (typeof DOCUMENT_ACTION_TYPES)[number]

const DOCUMENT_ACTION_TYPE_SET: ReadonlySet<string> = new Set<string>(DOCUMENT_ACTION_TYPES)

/** Narrows a wire action code, or `null` when the server named an unknown action. */
export function toDocumentActionType(action: string): DocumentActionType | null {
  return DOCUMENT_ACTION_TYPE_SET.has(action) ? (action as DocumentActionType) : null
}