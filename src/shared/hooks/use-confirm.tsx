import { useCallback, useRef, useState, type ReactElement } from 'react'

import { ConfirmDialog, type ConfirmDialogVariant } from '@/shared/ui/confirm-dialog'

export type ConfirmRequest = {
  title?: string
  message: string
  variant?: ConfirmDialogVariant
  confirmLabel?: string
  cancelLabel?: string
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  execute?: (reason: string | undefined) => void | Promise<void>
}

export type ConfirmResult = { confirmed: true; reason?: string } | { confirmed: false }

/**
 * Returns a `confirm(request)` promise and the dialog element to render once at
 * the page root. The promise settles only when the dialog closes: `true` after
 * confirmation (with the entered reason), `false` on cancel/Escape/overlay
 * dismissal. Calls made while a dialog is already open settle immediately with
 * `{ confirmed: false }`.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const openRef = useRef(false)
  const busyRef = useRef(false)
  const requestRef = useRef<ConfirmRequest | null>(null)
  const pendingRef = useRef<
    | {
        resolve: (result: ConfirmResult) => void
        reject: (error: unknown) => void
      }
    | undefined
  >(undefined)

  const settle = useCallback((result: ConfirmResult) => {
    const pending = pendingRef.current
    pendingRef.current = undefined
    pending?.resolve(result)
  }, [])

  const closeDialog = useCallback(
    (result: ConfirmResult) => {
      openRef.current = false
      busyRef.current = false
      setRequest(null)
      setBusy(false)
      settle(result)
    },
    [settle],
  )

  const confirm = useCallback((nextRequest: ConfirmRequest): Promise<ConfirmResult> => {
    if (openRef.current) {
      return Promise.resolve({ confirmed: false })
    }
    openRef.current = true
    busyRef.current = false
    requestRef.current = nextRequest
    setRequest(nextRequest)
    setBusy(false)
    setReason('')
    return new Promise<ConfirmResult>((resolve, reject) => {
      pendingRef.current = { resolve, reject }
    })
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen || busyRef.current) return
      closeDialog({ confirmed: false })
    },
    [closeDialog],
  )

  const handleConfirm = useCallback(
    async (confirmReason?: string) => {
      const currentRequest = requestRef.current
      if (!currentRequest || busyRef.current) return
      if (currentRequest.execute) {
        busyRef.current = true
        setBusy(true)
        try {
          await currentRequest.execute(confirmReason)
        } catch (error) {
          busyRef.current = false
          setBusy(false)
          const pending = pendingRef.current
          pendingRef.current = undefined
          pending?.reject(error)
          return
        }
      }
      closeDialog(
        confirmReason === undefined
          ? { confirmed: true }
          : { confirmed: true, reason: confirmReason },
      )
    },
    [closeDialog],
  )

  const hasReasonUi =
    request !== null &&
    (request.requireReason === true ||
      request.reasonLabel !== undefined ||
      request.reasonPlaceholder !== undefined)

  const requestProps = {
    ...(request?.title !== undefined ? { title: request.title } : {}),
    ...(request?.confirmLabel !== undefined ? { confirmLabel: request.confirmLabel } : {}),
    ...(request?.cancelLabel !== undefined ? { cancelLabel: request.cancelLabel } : {}),
    ...(request?.reasonLabel !== undefined ? { reasonLabel: request.reasonLabel } : {}),
    ...(request?.reasonPlaceholder !== undefined
      ? { reasonPlaceholder: request.reasonPlaceholder }
      : {}),
    ...(hasReasonUi ? { reason, onReasonChange: setReason } : {}),
  }

  const element: ReactElement = (
    <ConfirmDialog
      open={request !== null}
      busy={busy}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      message={request?.message ?? ''}
      variant={request?.variant ?? 'confirm'}
      requireReason={request?.requireReason ?? false}
      {...requestProps}
    />
  )

  return { confirm, element }
}
