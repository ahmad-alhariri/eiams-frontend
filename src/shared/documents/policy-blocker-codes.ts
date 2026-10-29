/**
 * Canonical server policy-failure vocabulary (e24-t07).
 *
 * ## Why this module exists
 *
 * The OpenAPI contract types `PolicyBlocker.code` as an unconstrained `string`
 * (`contracts/openapi/eiams-v1.openapi.json`, `PolicyBlocker`), so nothing pins
 * the legal values. Several spellings of the same requirement had consequently
 * grown up in parallel, and no consumer recognised all of them:
 *
 * | Vocabulary | Example | Where it came from |
 * | --- | --- | --- |
 * | Bare (canonical) | `signed_original_missing` | D-ATT-01 `docs/signed-original-gate-decision.md` names these three codes as the machine gate reasons |
 * | Namespaced | `document.signed_original_missing` | MSW test factories + dev mock `reEvaluateAttachmentPolicy` |
 * | PascalCase | `SignedOriginalRequired` | dev mock adjustment handlers — **not** a contract code |
 * | Backend dotted | `WarehouseDocuments.SignedCopyRequired` | the backend's own code for the same requirement (`WarehouseDocumentErrors.SignedCopyRequired`) |
 *
 * The PascalCase spelling is still rejected; the backend's dotted one is
 * accepted, so "is this a signed-original blocker?" has exactly one answer in
 * the codebase instead of one per surface.
 *
 * The backend's NORMALIZED `WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED` — the
 * `error-copy-ar.ts` key its error envelope resolves to — is NOT part of this
 * vocabulary: that spelling belongs to the error-envelope namespace, not to the
 * policy-blocker one.
 *
 * ## Current state
 *
 * Every consumer asks THIS module and nothing else: the attachment gate row,
 * the preflight gates (`document-policy-gates.ts`), the lifecycle action bar and
 * the adjustment action bar. None of them carries a matcher of its own — the
 * private copy the gates module used to keep is gone, and the action bars no
 * longer compare a code against a string literal.
 *
 * `isSignedOriginalBlocker` is the entry point the consumers call (it takes the
 * blocker); `isSignedOriginalBlockerCode` is its code-level base.
 *
 * ## Who states the reason (eiams-frontend-n31q)
 *
 * The **attachment gate row owns the signed-original reason**; the lifecycle and
 * adjustment action bars omit it as a duplicate. The row sits next to the badge
 * that states the requirement, so it is where a user looks for the reason — and a
 * bar rendered above it would print the same Arabic sentence twice on one
 * screen.
 *
 * The reason itself is resolved by `document-policy-gates.ts`
 * (`signedOriginalBlockerReasonAr`): the server's own Arabic sentence, else the
 * governed copy table, else the canonical policy-gate copy. No surface invents
 * a sentence of its own.
 *
 * This couples the two surfaces: an action bar rendered without an attachment
 * panel would no longer state the signed-original reason. That is acceptable
 * today because both bars are only mounted alongside a panel
 * (`document-detail-page`, `adjustment-detail-page`), and
 * `src/test/policy-failure-surfaces.test.tsx` fails if that ever stops holding.
 *
 * ## Matching policy
 *
 * A code is treated as a signed-original gate reason when it is the bare code, a
 * dot-namespaced variant of it, or the backend's own dotted signed-copy code.
 * Matching is **not** case-insensitive and does **not** normalize away arbitrary
 * namespaces: the contract vocabulary is lower-snake, and silently accepting a
 * code we do not recognise would let a future PascalCase regression pass
 * unnoticed. The dev mock's `SignedOriginalRequired` is aligned to the canonical
 * vocabulary in the same change that introduced this module, so no legitimate
 * producer relies on the looser reading.
 */

/** Machine gate reasons named by D-ATT-01 for the signed-original gate. */
export const SIGNED_ORIGINAL_BLOCKER_CODES = [
  'signed_original_missing',
  'signed_original_invalid',
  'signed_original_immutable',
] as const

export type SignedOriginalBlockerCode = (typeof SIGNED_ORIGINAL_BLOCKER_CODES)[number]

/** The single advisory code in the v1 contract (`OperationalAdvisory.code`). */
export const ACTIVE_SOFT_FREEZE_ADVISORY_CODE = 'ActiveSoftFreeze' as const

/**
 * The backend's own code for the signed-original requirement, in the dotted
 * domain spelling the live API serves
 * (`WarehouseDocumentErrors.SignedCopyRequired`).
 *
 * It states the SAME requirement as the three D-ATT-01 codes, so it belongs to
 * this vocabulary instead of to a private comparison inside one action bar.
 */
export const BACKEND_SIGNED_COPY_REQUIRED_CODE = 'WarehouseDocuments.SignedCopyRequired' as const

/**
 * Namespace the contract producers prefix machine codes with when embedding them
 * in a richer vocabulary (for example `document.signed_original_missing`).
 */
const KNOWN_NAMESPACES = ['document.'] as const

/**
 * True when `code` is a signed-original gate reason: the bare code, a
 * known-namespaced variant of it, or the backend's own signed-copy code. Rejects
 * every other code, including unknown ones, so an unrecognised vocabulary
 * cannot be mistaken for a recognised gate.
 */
export function isSignedOriginalBlockerCode(
  code: string,
): code is SignedOriginalBlockerCode | typeof BACKEND_SIGNED_COPY_REQUIRED_CODE {
  if (code === BACKEND_SIGNED_COPY_REQUIRED_CODE) return true
  for (const canonical of SIGNED_ORIGINAL_BLOCKER_CODES) {
    if (code === canonical) return true
    for (const namespace of KNOWN_NAMESPACES) {
      if (code === `${namespace}${canonical}`) return true
    }
  }
  return false
}

/**
 * Every accepted spelling of a `signed_original_*` gate reason, for fixtures and
 * tests. The backend's own dotted signed-copy code is a separate vocabulary
 * member and is not a variant of these three.
 */
export function signedOriginalBlockerCodeVariants(
  code: SignedOriginalBlockerCode,
): readonly string[] {
  return [code, ...KNOWN_NAMESPACES.map((namespace) => `${namespace}${code}`)]
}

/**
 * The one predicate every consumer asks: is this blocker the signed-original
 * requirement?
 *
 * The attachment gate row answers yes by stating the reason; the lifecycle and
 * adjustment action bars answer yes by OMITTING the blocker, because the gate
 * row already states it and the identical Arabic sentence must not appear twice
 * on one screen (eiams-frontend-n31q).
 *
 * This couples the two surfaces: an action bar rendered without an attachment
 * panel would no longer state the signed-original reason. That is acceptable
 * today because both bars are only mounted alongside a panel
 * (`document-detail-page`, `adjustment-detail-page`), and
 * `src/test/policy-failure-surfaces.test.tsx` fails if that ever stops holding.
 */
export function isSignedOriginalBlocker(blocker: { code: string }): boolean {
  return isSignedOriginalBlockerCode(blocker.code)
}
