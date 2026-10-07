import { createActionAvailability, createPolicyBlocker } from '@/test/msw/factories'
import type {
  ActionAvailability,
  DocumentPolicy,
  OperationalAdvisory,
} from '@/shared/types/generated/eiams-v1'

/**
 * The four policy states a Draft adjustment has to be able to present.
 *
 * These are CONTRACT-LEGAL states the UI must render but which the ordinary
 * "evaluate the policy" path can never produce, because in the ordinary path the
 * answer is always the same: no signed copy attached yet, therefore Post is
 * blocked. Both extra states existed only as inline object literals inside the
 * dev mock's `POST /adjustments` handler, so the moment that handler is deleted
 * the states disappear and nothing can exercise them. They are here as a pure
 * function so a test can ask for exactly one of the four and assert the whole
 * policy — actions, blockers, advisories, and the `signedOriginalSatisfied` flag
 * that the action bar is driven from.
 *
 * Ported by bead `eiams-frontend-79na` (EPIC G7) so G7.6 (`eiams-frontend-m4jm`)
 * cannot lose them.
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

/**
 * Opt-in switches, read by the dev mock from the request body so a QA session
 * can reach a state on demand. Both default to `false`: an unflagged request
 * must produce exactly the default draft policy, or every existing caller of the
 * endpoint would change behaviour when this module was introduced.
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
  readonly evaluatedAt: string
  readonly warehouseId: string
  readonly scenario?: AdjustmentPolicyScenario
  /** Advisory payload; defaults describe one count covering this warehouse. */
  readonly softFreezeAdvisory?: OperationalAdvisory
}

const DEFAULT_SOFT_FREEZE_ADVISORY = {
  code: 'ActiveSoftFreeze',
  countId: '523e4567-e89b-42d3-a456-4266141740c1',
  countReference: 'EIAMS-CNT-2026-0114',
  messageAr: 'هناك جرد نشط يغطي نطاق هذا المستودع.',
  overlapState: 'Provisional',
  scopeSummaryAr: 'المستودع المركزي',
  severity: 'Warning',
} satisfies OperationalAdvisory

/**
 * The single `Post` row for a Draft adjustment's policy. A Draft adjustment is
 * never postable as it stands, and both non-default states differ from the
 * default only in this one row plus the blockers list.
 */
function postAvailability(signedOriginalSatisfied: boolean): ActionAvailability {
  return signedOriginalSatisfied
    ? createActionAvailability('Post', {
        allowed: true,
        confirmationRequired: true,
        presentation: 'Enabled',
      })
    : createActionAvailability('Post', {
        allowed: false,
        confirmationRequired: true,
        presentation: 'Disabled',
        reasonAr: SIGNED_ORIGINAL_REQUIRED_AR,
        reasonCode: SIGNED_ORIGINAL_MISSING_CODE,
      })
}

/**
 * Builds the Draft adjustment policy for one of the four states:
 *
 *   (a) default                → Post Disabled, blocked by `document.signed_original_missing`
 *   (b) `simulateSoftFreeze`   → the default policy plus one `ActiveSoftFreeze` advisory
 *   (c) `simulateEnabledWithBlocker` → Post Enabled, and the only blocker is the
 *                                  UNRELATED `warehouse.capability_changed`
 *   (d) no scenario flags      → byte-identical to (a)
 *
 * (b) and (c) are independent switches, so both may be requested at once; the
 * policy then carries the Enabled Post, the unrelated blocker, and the advisory.
 */
export function simulateAdjustmentDraftPolicy(input: AdjustmentDraftPolicyInput): DocumentPolicy {
  const simulateSoftFreeze = input.scenario?.simulateSoftFreeze === true
  const simulateEnabledWithBlocker = input.scenario?.simulateEnabledWithBlocker === true
  const advisory = input.softFreezeAdvisory ?? {
    ...DEFAULT_SOFT_FREEZE_ADVISORY,
    warehouseId: input.warehouseId,
  }

  return {
    actions: [postAvailability(simulateEnabledWithBlocker)],
    advisories: simulateSoftFreeze ? [advisory] : [],
    blockers: simulateEnabledWithBlocker
      ? [
          createPolicyBlocker({
            code: UNRELATED_BLOCKER_CODE,
            field: null,
            messageAr: UNRELATED_BLOCKER_AR,
          }),
        ]
      : [
          createPolicyBlocker({
            code: SIGNED_ORIGINAL_MISSING_CODE,
            messageAr: SIGNED_ORIGINAL_REQUIRED_AR,
          }),
        ],
    documentId: input.documentId,
    documentStatus: 'Draft',
    evaluatedAt: input.evaluatedAt,
    policyKind: 'Adjustment',
    rowVersion: 0,
    signedOriginalSatisfied: simulateEnabledWithBlocker,
  }
}
