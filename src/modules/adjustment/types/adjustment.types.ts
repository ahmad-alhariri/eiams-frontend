import type { AdjustmentPurpose, operations } from '@/shared/types/generated/eiams-v1'

/**
 * Contract-derived shapes for the adjustment module (e21-t01).
 *
 * Adjustment is a manager-owned exception to the shared document engine
 * (docs/adjustment-workflow-decision.md): a dedicated `/adjustments` endpoint
 * family, the lifecycle `Draft → Posted → Reversed` only — there is no
 * Submitted/Approved/Cancelled state — and three purposes: `CountVariance`
 * (count-linked variance lines), `DirectCorrection` (signed stock-difference
 * lines), and `Disposal` (exactly one asset-backed line at quantity −1;
 * terminal and never reversible in v1).
 */
export type ListAdjustmentsQuery = NonNullable<operations['listAdjustments']['parameters']['query']>
export type AdjustmentDraftRequest =
  operations['createAdjustment']['requestBody']['content']['application/json']
export type UpdateAdjustmentRequest =
  operations['updateAdjustment']['requestBody']['content']['application/json']
export type ListDisposalEligibleAssetsQuery = NonNullable<
  operations['listDisposalEligibleAssets']['parameters']['query']
>

/** Arabic labels for the adjustment purposes (D-ADJ-01). */
export const ADJUSTMENT_PURPOSE_LABELS_AR = {
  CountVariance: 'تسوية فروقات الجرد',
  DirectCorrection: 'تسوية مباشرة',
  Disposal: 'إعدام أصل',
} as const

/** Arabic labels for the manager-owned adjustment lifecycle. */
export const ADJUSTMENT_STATUS_LABELS_AR = {
  Draft: 'مسودة',
  Posted: 'مرحّل',
  Reversed: 'معكوس',
} as const

/**
 * Disposal is terminal in v1 — the UI never renders a reversal action for a
 * disposal adjustment because the server rejects it outright.
 */
export function isDisposalPurpose(purpose: AdjustmentPurpose): boolean {
  return purpose === 'Disposal'
}
