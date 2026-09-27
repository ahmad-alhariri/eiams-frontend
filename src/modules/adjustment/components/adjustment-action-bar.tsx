import { useState } from 'react'

import {
  usePostAdjustmentAction,
  useReverseAdjustmentAction,
} from '@/modules/adjustment/hooks/use-adjustment-actions'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { Button } from '@/shared/ui/button'

/**
 * Manager-owned adjustment action bar (e21-t06). Composes the server policy
 * (embedded `DocumentPolicy` on the read model) with the session permission
 * gate — the shared document LifecycleActionBar is NOT reused because
 * adjustments have no Submit/Reject/Revise/Cancel transitions (D-ADJ-01):
 * only Post (Draft) and Reverse (Posted, ordinary purposes) exist.
 *
 * - Post renders only when the policy presents it AND the manager holds the
 *   posting permission; disabled with the server's Arabic reason while the
 *   SignedOriginal prerequisite is unmet. The server presentation is the sole
 *   gate — a blocker is surfaced, never treated as a local disable signal.
 * - Reverse never renders for a disposal adjustment (terminal state).
 * - Server advisories render as muted notes and never gate an action (e24-t07).
 * - The server remains authoritative: every click fires the idempotent
 *   mutation and surfaces the Arabic failure envelope on rejection.
 */
export function AdjustmentActionBar({
  adjustmentId,
  status,
  purpose,
  rowVersion,
  actions,
  blockers,
  advisories,
}: {
  adjustmentId: string
  status: 'Draft' | 'Posted' | 'Reversed'
  /** Disposal adjustments are terminal — no reverse action, ever. */
  purpose: 'CountVariance' | 'DirectCorrection' | 'Disposal'
  rowVersion: number
  /** Server-authored availability slice from the embedded DocumentPolicy. */
  actions: ReadonlyArray<{
    action: string
    allowed: boolean
    presentation: 'Hidden' | 'Disabled' | 'Enabled'
    reasonAr?: string | null
    reasonRequired?: boolean
  }>
  /** Server blockers (SignedOriginal etc.) echoed under the bar. */
  blockers: ReadonlyArray<{ code: string; messageAr: string }>
  /**
   * Server policy advisories (e24-t07). Advisory codes are the ONLY codes in the
   * v1 contract, so an ActiveSoftFreeze warning silently disappeared on the
   * adjustment surface. They render as muted notes and never gate an action.
   */
  advisories: ReadonlyArray<{
    code: string
    messageAr: string
    countReference?: string | null
    scopeSummaryAr?: string | null
  }>
}) {
  const { has } = usePermission()
  const postAction = usePostAdjustmentAction(adjustmentId)
  const reverseAction = useReverseAdjustmentAction(adjustmentId)
  const [reverseReason, setReverseReason] = useState('')
  const [showReverseForm, setShowReverseForm] = useState(false)

  const postAvailability = actions.find((a) => a.action === 'Post')
  const reverseAvailability = actions.find((a) => a.action === 'Reverse')

  const canSeePost =
    status === 'Draft' &&
    has('document.post') &&
    postAvailability !== undefined &&
    postAvailability.presentation !== 'Hidden'

  const canSeeReverse =
    status === 'Posted' &&
    purpose !== 'Disposal' &&
    has('document.reverse') &&
    reverseAvailability !== undefined &&
    reverseAvailability.presentation !== 'Hidden'

  // e24-t07: a blocker is *displayed*, never used as a local gate. The server
  // owns whether an action is available (`presentation` / `allowed`); deriving
  // "blocked" from `blockers.length > 0` disabled Post even when the server
  // presented it as Enabled, diverging from the shared LifecycleActionBar for an
  // identical policy payload.
  const hasBlockers = blockers.length > 0

  if (!canSeePost && !canSeeReverse && status !== 'Draft' && status !== 'Posted') {
    return null
  }

  return (
    <div data-slot="adjustment-action-bar" className="grid gap-3">
      {hasBlockers ? (
        <div role="alert" className="flex flex-col gap-1 rounded-md bg-destructive/5 px-3 py-2">
          {blockers.map((blocker) => (
            <p key={blocker.code} className="text-sm font-medium text-destructive">
              {blocker.messageAr}
            </p>
          ))}
        </div>
      ) : null}

      {advisories.length > 0 ? (
        <div
          data-slot="adjustment-advisories"
          className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2"
        >
          {advisories.map((advisory) => (
            <p
              key={advisory.code}
              data-slot="policy-advisory-row"
              className="text-sm text-muted-foreground"
            >
              {advisory.messageAr}
              {advisory.scopeSummaryAr ? ` — ${advisory.scopeSummaryAr}` : ''}
              {advisory.countReference ? ` (مرجع: ${advisory.countReference})` : ''}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {canSeePost ? (
          <Button
            type="button"
            disabled={postAvailability?.allowed === false || postAction.isPending}
            title={
              postAvailability?.allowed === false
                ? (postAvailability.reasonAr ?? undefined)
                : undefined
            }
            onClick={() => postAction.mutate({ rowVersion })}
          >
            {postAction.isPending ? 'جارٍ الترحيل...' : 'ترحيل السند'}
          </Button>
        ) : null}

        {canSeeReverse && !showReverseForm ? (
          <Button
            type="button"
            variant="outline"
            disabled={reverseAction.isPending || reverseAvailability?.allowed === false}
            onClick={() => setShowReverseForm(true)}
          >
            عكس السند
          </Button>
        ) : null}

        {/* Reversal requires a documented reason (D-ADJ-01 reasoned action). */}
        {canSeeReverse && showReverseForm ? (
          <div className="flex w-full flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
            <input
              className="h-10 w-full min-w-0 flex-1 rounded-md border border-input bg-popover px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="سبب العكس (إلزامي)"
              aria-label="سبب العكس"
              maxLength={500}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={reverseReason.trim() === '' || reverseAction.isPending}
              onClick={() => {
                reverseAction.mutate({ rowVersion, reason: reverseReason.trim() })
                setShowReverseForm(false)
                setReverseReason('')
              }}
            >
              {reverseAction.isPending ? 'جارٍ العكس...' : 'تأكيد العكس'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={reverseAction.isPending}
              onClick={() => setShowReverseForm(false)}
            >
              إلغاء
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
