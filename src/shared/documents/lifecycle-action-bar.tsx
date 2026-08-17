import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'

import { useConfirm } from '@/shared/hooks/use-confirm'
import type {
  ActionAvailability,
  DocumentActionType,
  DocumentPolicy,
} from '@/shared/types/generated/eiams-v1'
import { Button, type ButtonProps } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

export type LifecycleActionBarProps = {
  /**
   * Server-authoritative document policy. `null` renders nothing.
   * The bar never infers action availability locally (D-LIFE-01, D-ATT-01).
   */
  policy: DocumentPolicy | null
  /** Action code currently executing; the parent owns the mutation lifecycle. */
  busyAction: string | null
  onExecute: (action: DocumentActionType, reason?: string) => void | Promise<void>
  /** Defence-in-depth gate supplied by the parent; combined with presentation. */
  disabled?: boolean
  /**
   * Optional defence-in-depth permission gate. When provided, actions it
   * rejects are removed from `visibleActions` and never rendered — mirroring
   * how the server Hides unauthorized actions. When omitted, every action the
   * policy presents is rendered (backwards compatible).
   */
  isActionPermitted?: (action: DocumentActionType) => boolean
  className?: string
}

const GENERIC_ACTION_LABEL = 'تنفيذ الإجراء'

/**
 * Arabic labels keyed by normalized action code. The contract enum uses
 * PascalCase (`Submit`); backend permission-style codes (`document.submit`)
 * normalize to the same key.
 */
const ACTION_LABELS_AR: Readonly<Record<string, string>> = {
  edit: 'تعديل',
  submit: 'إرسال للترحيل',
  post: 'ترحيل',
  reject: 'رفض',
  revise: 'مراجعة',
  cancel: 'إلغاء',
  reverse: 'عكس',
  uploadattachment: 'رفع مرفق',
  deleteattachment: 'حذف المرفق',
}

const ACTION_BUTTON_VARIANTS: Readonly<Record<string, ButtonProps['variant']>> = {
  submit: 'secondary',
  post: 'default',
  reject: 'destructive',
  revise: 'outline',
  cancel: 'destructive',
  reverse: 'outline',
  edit: 'ghost',
  uploadattachment: 'outline',
  deleteattachment: 'destructive',
}

/** Consequential actions confirm through the destructive dialog treatment. */
const DESTRUCTIVE_CONFIRM_ACTIONS: ReadonlySet<string> = new Set([
  'reject',
  'cancel',
  'reverse',
  'deleteattachment',
])

function normalizeActionKey(action: string): string {
  return action.replace(/^document\./i, '').toLowerCase()
}

function getActionLabel(action: DocumentActionType): string {
  return ACTION_LABELS_AR[normalizeActionKey(action)] ?? GENERIC_ACTION_LABEL
}

function getButtonVariant(action: DocumentActionType): ButtonProps['variant'] {
  return ACTION_BUTTON_VARIANTS[normalizeActionKey(action)] ?? 'outline'
}

function requiresDestructiveConfirmation(action: DocumentActionType): boolean {
  return DESTRUCTIVE_CONFIRM_ACTIONS.has(normalizeActionKey(action))
}

function LifecycleActionBar({
  busyAction,
  className,
  disabled = false,
  isActionPermitted,
  onExecute,
  policy,
}: LifecycleActionBarProps) {
  const { confirm, element } = useConfirm()

  if (policy === null) {
    return null
  }

  const visibleActions = policy.actions.filter(
    (availability) =>
      availability.presentation !== 'Hidden' &&
      (isActionPermitted === undefined || isActionPermitted(availability.action)),
  )

  const handleClick = (availability: ActionAvailability) => {
    if (!availability.confirmationRequired) {
      void onExecute(availability.action, undefined)
      return
    }
    const label = getActionLabel(availability.action)
    void confirm({
      title: 'تأكيد الإجراء',
      message: `هل تريد تنفيذ «${label}»؟`,
      variant: requiresDestructiveConfirmation(availability.action) ? 'destructive' : 'confirm',
      confirmLabel: label,
      ...(availability.reasonRequired
        ? {
            requireReason: true,
            reasonLabel: 'سبب الإجراء',
            reasonPlaceholder: 'اكتب سبب الإجراء...',
          }
        : {}),
      execute: async (reason) => {
        await onExecute(availability.action, reason)
      },
    })
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {policy.blockers.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-md bg-destructive/5 px-3 py-2">
          {policy.blockers.map((blocker) => (
            <p
              key={blocker.code}
              className="flex items-start gap-2 text-sm font-medium text-destructive"
            >
              <IconAlertCircle
                data-slot="policy-blocker-icon"
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>{blocker.messageAr}</span>
            </p>
          ))}
        </div>
      ) : null}
      {policy.advisories.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-3 py-2">
          {policy.advisories.map((advisory) => (
            <p key={advisory.code} className="flex items-start gap-2 text-sm text-muted-foreground">
              <IconInfoCircle
                data-slot="policy-advisory-icon"
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>
                {advisory.messageAr}
                {advisory.scopeSummaryAr ? ` — ${advisory.scopeSummaryAr}` : null}
                {advisory.countReference ? ` (مرجع: ${advisory.countReference})` : null}
              </span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {visibleActions.map((availability) => {
          const isBusy =
            busyAction !== null &&
            normalizeActionKey(busyAction) === normalizeActionKey(availability.action)
          const isDisabled =
            availability.presentation === 'Disabled' || disabled || (busyAction !== null && !isBusy)
          return (
            <Button
              key={availability.action}
              type="button"
              variant={getButtonVariant(availability.action)}
              loading={isBusy}
              disabled={isDisabled}
              title={
                availability.presentation === 'Disabled'
                  ? (availability.reasonAr ?? undefined)
                  : undefined
              }
              onClick={() => handleClick(availability)}
            >
              {isBusy ? 'جارٍ التنفيذ...' : getActionLabel(availability.action)}
            </Button>
          )
        })}
      </div>
      {element}
    </div>
  )
}

export { LifecycleActionBar }
