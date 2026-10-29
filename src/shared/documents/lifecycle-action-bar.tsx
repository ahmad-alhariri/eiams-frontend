import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'

import {
  actionAvailabilityReasonAr,
  policyAdvisoryMessageAr,
  policyBlockerMessageAr,
} from '@/shared/documents/document-policy-gates'
import { isSignedOriginalBlocker } from '@/shared/documents/policy-blocker-codes'
import {
  toDocumentActionType,
  type DocumentActionType,
} from '@/shared/documents/types/document-action.types'
import type { DocumentPolicy } from '@/shared/documents/types/document-wire.types'
import { useConfirm } from '@/shared/hooks/use-confirm'
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

/**
 * One actionable policy entry: the server's own action code, already narrowed to
 * the vocabulary this bar can label, permission-gate and execute.
 *
 * `null` for an unrecognised code. The policy response types `action` as a bare
 * string, so an action this build has never heard of arrives here; rendering it
 * would put a button on screen with no label, no permission code and no route,
 * which is worse than rendering nothing.
 */
interface ActionableAvailability {
  readonly availability: DocumentPolicy['actions'][number]
  readonly action: DocumentActionType
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

  const presented: readonly ActionableAvailability[] = policy.actions
    .filter((availability) => availability.presentation !== 'Hidden')
    .flatMap((availability) => {
      const action = toDocumentActionType(availability.action)
      if (action === null) {
        return []
      }
      if (isActionPermitted !== undefined && !isActionPermitted(action)) {
        return []
      }
      return [{ availability, action }]
    })

  // F-15: a Disabled action's reason used to live ONLY in the button `title`
  // (hover-only, invisible to touch and keyboard. It is now stated in the body
  // too. Two deliberate rules keep that honest:
  //  - a reason the blocker alert already renders is NOT repeated (e24-t07: the
  //    same sentence must not appear twice on one screen);
  //  - identical reasons are shown once, so a terminal document with four
  //    Disabled transitions does not print the same line four times.
  const blockerMessagesAr = new Set(
    policy.blockers
      .map((blocker) => policyBlockerMessageAr(blocker))
      .filter((messageAr): messageAr is string => messageAr !== null),
  )
  const disabledReasonsAr: string[] = []
  for (const entry of presented) {
    if (entry.availability.presentation !== 'Disabled') {
      continue
    }
    const reasonAr = actionAvailabilityReasonAr(entry.availability)
    if (
      reasonAr === null ||
      blockerMessagesAr.has(reasonAr) ||
      disabledReasonsAr.includes(reasonAr)
    ) {
      continue
    }
    disabledReasonsAr.push(reasonAr)
  }

  const handleClick = (entry: ActionableAvailability) => {
    if (!entry.availability.confirmationRequired) {
      void onExecute(entry.action, undefined)
      return
    }
    const label = getActionLabel(entry.action)
    void confirm({
      title: 'تأكيد الإجراء',
      message: `هل تريد تنفيذ «${label}»؟`,
      variant: requiresDestructiveConfirmation(entry.action) ? 'destructive' : 'confirm',
      confirmLabel: label,
      ...(entry.availability.reasonRequired
        ? {
            requireReason: true,
            reasonLabel: 'سبب الإجراء',
            reasonPlaceholder: 'اكتب سبب الإجراء...',
          }
        : {}),
      execute: async (reason) => {
        await onExecute(entry.action, reason)
      },
    })
  }

  // The signed-original requirement is stated once per screen, by the attachment
  // gate row — it sits next to the badge that states the requirement and is
  // where a user looks for the reason. Alerting the same blocker here printed
  // the identical Arabic sentence twice on one document screen (grsv), so the
  // bar omits every signed-original blocker the canonical vocabulary names.
  const alertedBlockers = policy.blockers.filter((blocker) => !isSignedOriginalBlocker(blocker))

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {alertedBlockers.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-md bg-destructive/5 px-3 py-2">
          {alertedBlockers.map((blocker) => {
            const messageAr = policyBlockerMessageAr(blocker)
            return messageAr === null ? null : (
              <p
                key={`${blocker.action}-${blocker.code}`}
                className="flex items-start gap-2 text-sm font-medium text-destructive"
              >
                <IconAlertCircle
                  data-slot="policy-blocker-icon"
                  className="mt-0.5 shrink-0"
                  aria-hidden
                />
                <span>{messageAr}</span>
              </p>
            )
          })}
        </div>
      ) : null}
      {policy.warnings.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-3 py-2">
          {policy.warnings.map((advisory) => {
            const messageAr = policyAdvisoryMessageAr(advisory)
            return messageAr === null ? null : (
              <p
                key={advisory.code}
                data-slot="policy-advisory-row"
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <IconInfoCircle
                  data-slot="policy-advisory-icon"
                  className="mt-0.5 shrink-0"
                  aria-hidden
                />
                <span>{messageAr}</span>
              </p>
            )
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {presented.map((entry) => {
          const isBusy =
            busyAction !== null &&
            normalizeActionKey(busyAction) === normalizeActionKey(entry.action)
          const isDisabled =
            entry.availability.presentation === 'Disabled' ||
            disabled ||
            (busyAction !== null && !isBusy)
          const reasonAr = actionAvailabilityReasonAr(entry.availability)
          return (
            <Button
              key={entry.action}
              type="button"
              variant={getButtonVariant(entry.action)}
              loading={isBusy}
              disabled={isDisabled}
              title={reasonAr ?? undefined}
              onClick={() => handleClick(entry)}
            >
              {isBusy ? 'جارٍ التنفيذ...' : getActionLabel(entry.action)}
            </Button>
          )
        })}
      </div>
      {disabledReasonsAr.length > 0 ? (
        <ul
          data-slot="disabled-action-reasons"
          className="flex flex-col gap-1"
          aria-label="أسباب تعذّر تنفيذ الإجراءات"
        >
          {disabledReasonsAr.map((reasonAr) => (
            <li
              key={reasonAr}
              data-slot="disabled-action-reason"
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <IconInfoCircle aria-hidden className="mt-0.5 shrink-0" />
              <span>{reasonAr}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {element}
    </div>
  )
}

export { LifecycleActionBar }
