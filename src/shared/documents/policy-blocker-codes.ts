/**
 * Canonical server policy-failure vocabulary (e24-t07).
 *
 * ## Why this module exists
 *
 * The OpenAPI contract types `PolicyBlocker.code` as an unconstrained `string`
 * (`contracts/openapi/eiams-v1.openapi.json`, `PolicyBlocker`), so nothing pins
 * the legal values. Three vocabularies had consequently grown up in parallel,
 * and only one of them was recognised by every consumer:
 *
 * | Vocabulary | Example | Where it came from |
 * | --- | --- | --- |
 * | Bare (canonical) | `signed_original_missing` | D-ATT-01 `docs/signed-original-gate-decision.md` names these three codes as the machine gate reasons |
 * | Namespaced | `document.signed_original_missing` | MSW test factories + dev mock `reEvaluateAttachmentPolicy` |
 * | PascalCase | `SignedOriginalRequired` | dev mock adjustment handlers — **not** a contract code |
 *
 * `document-policy-gates.ts` already matched bare *and* namespaced codes, but
 * `attachment-panel.tsx` matched only the bare form, so a server blocker served
 * under the namespaced vocabulary never surfaced its Arabic message. That is the
 * defect this module removes by giving every consumer one exported predicate.
 *
 * ## Matching policy
 *
 * A code is treated as a signed-original gate reason when it is the bare code or
 * a dot-namespaced variant of it. Matching is **not** case-insensitive and does
 * **not** normalize away arbitrary namespaces: the contract vocabulary is
 * lower-snake, and silently accepting a code we do not recognise would let a
 * future PascalCase regression pass unnoticed. The dev mock's `SignedOriginalRequired`
 * is aligned to the canonical vocabulary in the same change that introduced this
 * module, so no legitimate producer relies on the looser reading.
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
 * Namespace the contract producers prefix machine codes with when embedding them
 * in a richer vocabulary (for example `document.signed_original_missing`).
 */
const KNOWN_NAMESPACES = ['document.'] as const

/**
 * True when `code` is a signed-original gate reason, in either the bare or a
 * known-namespaced form. Rejects every other code, including unknown ones, so
 * an unrecognised vocabulary cannot be mistaken for a recognised gate.
 */
export function isSignedOriginalBlockerCode(code: string): code is SignedOriginalBlockerCode {
  for (const canonical of SIGNED_ORIGINAL_BLOCKER_CODES) {
    if (code === canonical) return true
    for (const namespace of KNOWN_NAMESPACES) {
      if (code === `${namespace}${canonical}`) return true
    }
  }
  return false
}

/** Every accepted spelling of a signed-original gate reason, for fixtures and tests. */
export function signedOriginalBlockerCodeVariants(
  code: SignedOriginalBlockerCode,
): readonly string[] {
  return [code, ...KNOWN_NAMESPACES.map((namespace) => `${namespace}${code}`)]
}

/**
 * Blockers that the attachment gate row already explains in place, and which the
 * lifecycle/adjustment action bars therefore omit from their alert lists.
 *
 * e24-t07: the gate row and the action bar both received the same policy, so once
 * the gate row's blocker matching was corrected the identical Arabic sentence
 * rendered twice on one screen. The gate row is the better owner — it sits next
 * to the badge that states the requirement and is where a user looks for the
 * reason — so the bars drop the duplicate.
 *
 * This couples the two surfaces: an action bar rendered without an attachment
 * panel would no longer state the signed-original reason. That is acceptable
 * today because both bars are only mounted alongside a panel
 * (`document-detail-page`, `adjustment-detail-page`), and
 * `src/test/policy-failure-matrix.test.tsx` fails if that ever stops holding.
 */
export function isSignedOriginalBlocker(blocker: { code: string }): boolean {
  return isSignedOriginalBlockerCode(blocker.code)
}
