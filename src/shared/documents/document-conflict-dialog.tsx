import { ConflictRecoveryDialog } from '@/shared/ui/conflict-recovery-dialog'

const CONFLICT_TITLE_AR = 'تعديل متزامن على السند'
const CONFLICT_DESCRIPTION_AR =
  'عدّل مستخدم آخر هذا السند أثناء عملك، ولم يعد ما تعرضه النسخة الأحدث.'
const RECOVER_LABEL_AR = 'تحميل النسخة الأحدث'
const RECOVER_BUSY_LABEL_AR = 'جارٍ التحميل...'
const STAY_LABEL_AR = 'البقاء على النسخة الحالية'

export interface DocumentConflictDialogProps {
  /** True while the recovery refetch is in flight; the primary shows a busy state. */
  isRefreshing: boolean
  /** User chose to load the server's fresh version: refetch and clear the conflict. */
  onRecover: () => void
  /** User chose to stay on the stale view: clear the conflict without refetching. */
  onDismiss: () => void
}

/**
 * Document-specific copy for the shared neutral conflict dialog.
 *
 * The dialog structure, focus contract and "asserts nothing about whether the
 * write applied" semantics live in `@/shared/ui/conflict-recovery-dialog`
 * (eiams-frontend-3wv1, which extracted them for reuse by the count
 * quantity-entry workspace). This file keeps the document wording only, so the
 * document behaviour and its tests are unchanged.
 */
function DocumentConflictDialog({
  isRefreshing,
  onRecover,
  onDismiss,
}: DocumentConflictDialogProps) {
  return (
    <ConflictRecoveryDialog
      descriptionAr={CONFLICT_DESCRIPTION_AR}
      isRefreshing={isRefreshing}
      onDismiss={onDismiss}
      onRecover={onRecover}
      recoveringLabelAr={RECOVER_BUSY_LABEL_AR}
      recoverLabelAr={RECOVER_LABEL_AR}
      slot="document-conflict-dialog"
      stayLabelAr={STAY_LABEL_AR}
      titleAr={CONFLICT_TITLE_AR}
    />
  )
}

export { DocumentConflictDialog }
