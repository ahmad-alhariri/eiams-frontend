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

export interface DocumentConflictDialogProps {
  /** True while the recovery refetch is in flight; the primary shows a busy state. */
  isRefreshing: boolean
  /** User chose to load the server's fresh version: refetch and clear the conflict. */
  onRecover: () => void
  /** User chose to stay on the stale view: clear the conflict without refetching. */
  onDismiss: () => void
}

const CONFLICT_TITLE_AR = 'تعديل متزامن على السند'
const CONFLICT_DESCRIPTION_AR =
  'عدّل مستخدم آخر هذا السند أثناء عملك، ولم يعد ما تعرضه النسخة الأحدث.'
const RECOVER_LABEL_AR = 'تحميل النسخة الأحدث'
const RECOVER_BUSY_LABEL_AR = 'جارٍ التحميل...'
const STAY_LABEL_AR = 'البقاء على النسخة الحالية'

/**
 * Modal surfaced when a lifecycle mutation 409s (D-LIFE-01): the cached
 * document is no longer authoritative. The primary reloads the fresh version
 * through the shared recovery hook; the secondary deliberately stays on the
 * stale view (documented trade-off — further actions may 409 again). Mirrors
 * the ConfirmDialog structure on the alert-dialog primitives: RTL, Arabic,
 * Base UI owns focus trap and Escape (blocked while refreshing).
 */
function DocumentConflictDialog({
  isRefreshing,
  onRecover,
  onDismiss,
}: DocumentConflictDialogProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isRefreshing) {
          onDismiss()
        }
      }}
    >
      <AlertDialogContent size="sm" dir="rtl" aria-label={CONFLICT_TITLE_AR}>
        <div data-slot="document-conflict-dialog" className="contents">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning/10 text-warning">
              <IconRefresh aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>{CONFLICT_TITLE_AR}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {CONFLICT_DESCRIPTION_AR}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" loading={isRefreshing} onClick={onRecover}>
              {isRefreshing ? RECOVER_BUSY_LABEL_AR : RECOVER_LABEL_AR}
            </Button>
            <AlertDialogCancel disabled={isRefreshing}>{STAY_LABEL_AR}</AlertDialogCancel>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { DocumentConflictDialog }
