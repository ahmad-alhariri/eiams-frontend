import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import type { Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'

import { CounterpartSelectField } from '@/modules/custody/components/counterpart-select-field'
import { useAssignCustodyMutation } from '@/modules/custody/hooks/use-custody-queries'
import {
  assignCustodySchema,
  type AssignCustodyFormValues,
} from '@/modules/custody/schemas/assign-custody.schema'
import type { PendingCustody } from '@/modules/custody/types/custody.types'
import { normalizeApiError } from '@/shared/services/api-error'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface AssignCustodyDialogProps {
  /**
   * The pending row being assigned. It is the LIVE `GET /custodies/pending`
   * row (`PendingCustody`): the asset id travels in the path and the row's
   * `rowVersion` is the `expectedCustodyRowVersion` the controller compares.
   */
  custody: PendingCustody | null
  onClose: () => void
}

/**
 * Personal custody assignment flow (e19-t03): picks an active Employee via
 * the shared counterpart lookup and posts the idempotent assign mutation.
 * Server semantics close the operational custody row and open a Personal one
 * linked to the original issue document.
 */
export function AssignCustodyDialog({ custody, onClose }: AssignCustodyDialogProps) {
  const assignMutation = useAssignCustodyMutation()
  const open = custody !== null

  const methods = useForm<AssignCustodyFormValues>({
    resolver: zodResolver(assignCustodySchema) as Resolver<AssignCustodyFormValues>,
    defaultValues: { holderId: '', holderDisplayName: '', reason: '' },
    mode: 'onSubmit',
  })

  // Reset the form each time the dialog opens (per-row assignment is a fresh action).
  useEffect(() => {
    if (open) {
      methods.reset({ holderId: '', holderDisplayName: '', reason: '' })
      assignMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the target row changes
  }, [custody?.custodyId, open])

  const submit = methods.handleSubmit((values) => {
    if (custody === null) return
    // Live wire for `POST /assets/{assetId}/custody-assignment`:
    //   { employeeId, expectedCustodyRowVersion, note? }
    // `note` is omitted when the operator leaves the reason blank. The asset
    // id is the path segment, not a body field.
    const note =
      values.reason !== undefined && values.reason !== ''
        ? `${values.reason} (${values.holderDisplayName})`
        : `تكليف شخصي إلى ${values.holderDisplayName}`
    assignMutation.mutate(
      {
        assetId: custody.assetId,
        request: {
          employeeId: values.holderId,
          expectedCustodyRowVersion: custody.rowVersion,
          note,
        },
      },
      { onSuccess: onClose },
    )
  })

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تكليف حفظ شخصي</DialogTitle>
          <DialogDescription>
            سيُنشأ سطر حفظ شخصياً للموظف المحدد على الأصل{' '}
            <span dir="ltr" className="font-mono">
              {custody?.assetNumber ?? ''}
            </span>{' '}
            ويُغلق السطر التشغيلي الحالي.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...methods}>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit(event)
            }}
            className="grid gap-3 py-2"
          >
            <CounterpartSelectField control={methods.control} disabled={assignMutation.isPending} />
            <div className="grid gap-2">
              <label htmlFor="assign-reason" className="text-sm font-medium text-foreground">
                السبب (اختياري)
              </label>
              <Input
                id="assign-reason"
                {...methods.register('reason')}
                maxLength={300}
                placeholder="سبب التكليف..."
                disabled={assignMutation.isPending}
              />
              {methods.formState.errors.reason !== undefined ? (
                <p role="alert" className="text-sm text-destructive">
                  {methods.formState.errors.reason.message}
                </p>
              ) : null}
            </div>
            {assignMutation.error !== null ? (
              <p role="alert" className="text-sm text-destructive">
                {/* The server's own code decides the wording: no active
                    custody, an unknown or inactive employee and a stale row
                    version each name themselves instead of collapsing into one
                    generic sentence. */}
                {normalizeApiError(assignMutation.error).titleAr}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" disabled={assignMutation.isPending}>
                {assignMutation.isPending ? 'جارٍ التكليف...' : 'تأكيد التكليف'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
