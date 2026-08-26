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
 *   SignedOriginal prerequisite is unmet.
 * - Reverse never renders for a disposal adjustment (terminal state).
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
    has('document.create') &&
    postAvailability !== undefined &&
    postAvailability.presentation !== 'Hidden'

  const canSeeReverse =
    status === 'Posted' &&
    purpose !== 'Disposal' &&
    has('document.create') &&
    reverseAvailability !== undefined &&
    reverseAvailability.presentation !== 'Hidden'

  const postBlockedByServer = blockers.length > 0

  if (!canSeePost && !canSeeReverse && status !== 'Draft' && status !== 'Posted') {
    return null
  }

  return (
    <div data-slot="adjustment-action-bar" className="grid gap-3">
      {postBlockedByServer ? (
        <div role="alert" className="flex flex-col gap-1 rounded-md bg-destructive/5 px-3 py-2">
          {blockers.map((blocker) => (
            <p key={blocker.code} className="text-sm font-medium text-destructive">
              {blocker.messageAr}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {canSeePost ? (
          <Button
            type="button"
            disabled={
              postBlockedByServer || postAvailability?.allowed === false || postAction.isPending
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
