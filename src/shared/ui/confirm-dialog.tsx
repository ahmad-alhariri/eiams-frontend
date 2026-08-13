import { useId, useState } from 'react'
import { IconAlertCircle, IconAlertTriangle } from '@tabler/icons-react'

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
import { Textarea } from '@/shared/ui/textarea'

export type ConfirmDialogVariant = 'confirm' | 'destructive'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  message: string
  variant?: ConfirmDialogVariant
  confirmLabel?: string
  cancelLabel?: string
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reason?: string
  onReasonChange?: (reason: string) => void
  busy?: boolean
  onCancel?: () => void
  onConfirm: (reason: string | undefined) => void | Promise<void>
}

function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    message,
    variant = 'confirm',
    requireReason = false,
    busy = false,
    onCancel,
    onConfirm,
  } = props
  const title = props.title ?? 'تأكيد الإجراء'
  const confirmLabel = props.confirmLabel ?? 'تأكيد'
  const cancelLabel = props.cancelLabel ?? 'إلغاء'
  const reasonLabel = props.reasonLabel ?? 'سبب الإجراء'
  const reasonId = useId()
  const hasReasonField =
    requireReason ||
    props.reasonLabel !== undefined ||
    props.reasonPlaceholder !== undefined ||
    props.reason !== undefined ||
    props.onReasonChange !== undefined

  const [internalReason, setInternalReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const isReasonControlled = props.reason !== undefined
  const reasonValue = isReasonControlled ? (props.reason ?? '') : internalReason

  const [previousOpen, setPreviousOpen] = useState(open)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (!open) {
      setReasonError(false)
      if (!isReasonControlled) {
        setInternalReason('')
      }
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy && !nextOpen) return
    onOpenChange(nextOpen)
  }

  const handleReasonChange = (nextReason: string) => {
    if (!isReasonControlled) {
      setInternalReason(nextReason)
    }
    props.onReasonChange?.(nextReason)
    setReasonError(false)
  }

  const handleConfirmClick = () => {
    const trimmedReason = reasonValue.trim()
    if (requireReason && trimmedReason === '') {
      setReasonError(true)
      return
    }
    onConfirm(trimmedReason === '' ? undefined : trimmedReason)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm">
        <div data-slot="confirm-dialog" className="contents">
          <AlertDialogHeader>
            <AlertDialogMedia
              className={
                variant === 'confirm'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-destructive/10 text-destructive'
              }
            >
              {variant === 'confirm' ? (
                <IconAlertTriangle aria-hidden />
              ) : (
                <IconAlertCircle aria-hidden />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">{message}</AlertDialogDescription>
          </AlertDialogHeader>
          {hasReasonField ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={reasonId} className="text-base font-medium text-foreground">
                {reasonLabel}
              </label>
              <Textarea
                id={reasonId}
                value={reasonValue}
                onChange={(event) => handleReasonChange(event.target.value)}
                placeholder={props.reasonPlaceholder}
                aria-invalid={reasonError || undefined}
              />
              {reasonError ? (
                <p role="alert" className="text-sm text-destructive">
                  سبب الإجراء مطلوب
                </p>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <Button
              type="button"
              variant={variant === 'confirm' ? 'default' : 'destructive'}
              loading={busy}
              onClick={handleConfirmClick}
            >
              {busy ? 'جارٍ التنفيذ...' : confirmLabel}
            </Button>
            <AlertDialogCancel disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
