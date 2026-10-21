import type {
  DocumentActionAvailability,
  DocumentPolicy,
} from '@/shared/documents/types/document-wire.types'

/**
 * The four policy states a Draft adjustment has to be able to present.
 *
 * Adjustment responses embed no policy (D-INT-02): the shared document engine
 * serves it from `GET /warehouse-documents/{documentId}/policy`, keyed by the
 * adjustment's own id. These are CONTRACT-LEGAL states that read can answer
 * with but which the ordinary "evaluate the policy" path never produces, because
 * in the ordinary path the answer is always the same: no signed copy attached
 * yet, therefore Post is blocked. They are here as a pure function so a test
 * can ask for exactly one of the four and assert the whole wire policy —
 * actions, blockers, warnings, and the `signedOriginalSatisfied` flag the
 * action bar and attachment gate are driven from.
 */

/** POLICY-BLOCKER code (frontend vocabulary) — NOT a wire error code. */
export const SIGNED_ORIGINAL_MISSING_CODE = 'document.signed_original_missing'

/**
 * The blocker code used by the "Post is Enabled anyway" state. It is
 * deliberately a DIFFERENT domain from the signed-original blocker: the point of
 * that state is that the action bar must leave Post enabled and still list a
 * blocker, which is exactly what happens when the blocker belongs to some other
 * business policy (here: the warehouse's capability for this domain changed).
 */
export const UNRELATED_BLOCKER_CODE = 'warehouse.capability_changed'

/** Arabic copy for the signed-original blocker on a Draft adjustment. */
export const SIGNED_ORIGINAL_REQUIRED_AR = 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.'

/** Arabic copy for the unrelated business-policy blocker. */
export const UNRELATED_BLOCKER_AR = 'تغيّرت قدرة المستودع، راجع سجل القدرات.'

/** Arabic copy for the ActiveSoftFreeze warning. */
export const SOFT_FREEZE_ADVISORY_AR = 'هناك جرد نشط يغطي نطاق هذا المستودع.'

/**
 * Opt-in switches, read by the test calling the policy read's fixture handler
 * so a session can reach a state on demand. Both default to `false`: an
 * unflagged request must produce exactly the default draft policy, or every
 * existing caller of the endpoint would change behaviour when this module was
 * introduced.
 */
export interface AdjustmentPolicyScenario {
  /** Attach an `ActiveSoftFreeze` advisory (an open count overlaps this warehouse). */
  readonly simulateSoftFreeze?: boolean
  /** Present Post as `Enabled` while an UNRELATED blocker is present. */
  readonly simulateEnabledWithBlocker?: boolean
}

export interface AdjustmentDraftPolicyInput {
  readonly documentId: string
  /** Timestamp stamped on the policy; pass one explicitly to keep this pure. */
  readonly evaluatedAtUtc: string
  readonly warehouseId: string
  readonly scenario?: AdjustmentPolicyScenario
  /** Advisory payload; defaults describe one count covering this warehouse. */
  readonly softFreezeAdvisory?: {
    readonly code: string
    readonly message: string
    readonly countId: string | null
    readonly warehouseId: string | null
  }
}

const SOFT_FREEZE_COUNT_ID = '523e4567-e89b-42d3-a456-4266141740c1'

/**
 * The single `Post` row for a Draft adjustment's wire policy. A Draft adjustment
 * is never postable as it stands, and both non-default states differ from the
 * default only in this one row plus the blockers list.
 */
function postAvailability(signedOriginalSatisfied: boolean): DocumentActionAvailability {
  return signedOriginalSatisfied
    ? {
        action: 'Post',
        allowed: true,
        confirmationRequired: true,
        reasonRequired: false,
        presentation: 'Enabled',
        reasonCode: null,
        reason: null,
      }
    : {
        action: 'Post',
        allowed: false,
        confirmationRequired: true,
        reasonRequired: false,
        presentation: 'Disabled',
        reasonCode: SIGNED_ORIGINAL_MISSING_CODE,
        reason: SIGNED_ORIGINAL_REQUIRED_AR,
      }
}

/**
 * Builds the Draft adjustment wire policy for one of the four states:
 *
 *   (a) default                → Post Disabled, blocked by `document.signed_original_missing`
 *   (b) `simulateSoftFreeze`   → the default policy plus one `ActiveSoftFreeze` warning
 *   (c) `simulateEnabledWithBlocker` → Post Enabled, and the only blocker is the
 *                                  UNRELATED `warehouse.capability_changed`
 *   (d) no scenario flags      → byte-identical to (a)
 *
 * (b) and (c) are independent switches, so both may be requested at once; the
 * policy then carries the Enabled Post, the unrelated blocker, and the warning.
 */
export function simulateAdjustmentDraftPolicy(input: AdjustmentDraftPolicyInput): DocumentPolicy {
  const simulateSoftFreeze = input.scenario?.simulateSoftFreeze === true
  const simulateEnabledWithBlocker = input.scenario?.simulateEnabledWithBlocker === true

  return {
    documentId: input.documentId,
    status: 'Draft',
    rowVersion: 0,
    evaluatedAtUtc: input.evaluatedAtUtc,
    signedOriginalSatisfied: simulateEnabledWithBlocker,
    actions: [postAvailability(simulateEnabledWithBlocker)],
    warnings: simulateSoftFreeze
      ? [
          input.softFreezeAdvisory ?? {
            code: 'ActiveSoftFreeze',
            message: SOFT_FREEZE_ADVISORY_AR,
            countId: SOFT_FREEZE_COUNT_ID,
            warehouseId: input.warehouseId,
          },
        ]
      : [],
    blockers: simulateEnabledWithBlocker
      ? [{ action: 'Post', code: UNRELATED_BLOCKER_CODE, message: UNRELATED_BLOCKER_AR }]
      : [
          {
            action: 'Post',
            code: SIGNED_ORIGINAL_MISSING_CODE,
            message: SIGNED_ORIGINAL_REQUIRED_AR,
          },
        ],
  }
}
