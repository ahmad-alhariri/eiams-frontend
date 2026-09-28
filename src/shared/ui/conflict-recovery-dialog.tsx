import { IconRefresh } from '@tabler/icons-react'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'

export interface ConflictRecoveryDialogCopy {
  /** Headline. Names the resource in the user's terms. */
  titleAr: string
  /**
   * What happened, and — critically — what is NOT being claimed. The copy must
   * not assert whether the rejected write was applied, because a 409 does not
   * carry that information and guessing it would be a fabricated fact.
   */
  descriptionAr: string
  recoverLabelAr: string
  recoveringLabelAr: string
  stayLabelAr: string
  /** Stable hook for tests and for asserting which feature rendered the dialog. */
  slot?: string
}

export interface ConflictRecoveryDialogProps extends ConflictRecoveryDialogCopy {
  /** True while the recovery refetch is in flight; the primary shows a busy state. */
  isRefreshing: boolean
  /** User chose to load the server's fresh version: refetch and clear the conflict. */
  onRecover: () => void
  /** User chose to stay on the current view: clear the conflict without refetching. */
  onDismiss: () => void
}

/**
 * Neutral "the server rejected this against its own current state" dialog.
 *
 * The point of this component is that it says **nothing about whether the write
 * applied**. A 409 is returned for a stale row version, a lifecycle/state
 * conflict or an idempotency conflict, and those are not distinguishable from
 * the response — so a UI that reports "3 of 5 lines were saved" would be
 * inventing a fact. This dialog therefore only offers the two honest choices:
 * load the authoritative version, or stay and keep what you have.
 *
 * Extracted from `shared/documents/document-conflict-dialog.tsx` when the count
 * quantity-entry workspace needed the same neutral recovery affordance
 * (eiams-frontend-3wv1). That file remains the document-specific binding of
 * this component, so the two features share one implementation and one focus
 * contract rather than two near-identical dialogs.
 *
 * Mirrors the `ConfirmDialog` structure on the alert-dialog primitives: RTL,
 * Arabic, and Base UI owns the focus trap and Escape (blocked while refreshing).
 */
export function ConflictRecoveryDialog({
  descriptionAr,
  isRefreshing,
  onDismiss,
  onRecover,
  recoveringLabelAr,
  recoverLabelAr,
  slot = 'conflict-recovery-dialog',
  stayLabelAr,
  titleAr,
}: ConflictRecoveryDialogProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isRefreshing) {
          onDismiss()
        }
      }}
    >
      <AlertDialogContent size="sm" dir="rtl" aria-label={titleAr}>
        <div data-slot={slot} className="contents">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning/10 text-warning">
              <IconRefresh aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>{titleAr}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {descriptionAr}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" loading={isRefreshing} onClick={onRecover}>
              {isRefreshing ? recoveringLabelAr : recoverLabelAr}
            </Button>
            <AlertDialogCancel disabled={isRefreshing}>{stayLabelAr}</AlertDialogCancel>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
