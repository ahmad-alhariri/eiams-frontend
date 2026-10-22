import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'

import { CounterpartSelectField } from '@/modules/custody/components/counterpart-select-field'
import { useTransferCustodyMutation } from '@/modules/custody/hooks/use-custody-queries'
import {
  transferCustodySchema,
  type TransferCustodyFormValues,
} from '@/modules/custody/schemas/transfer-custody.schema'
import type {
  Custody,
  CustodyKind,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'
import type { CounterpartType } from '@/modules/organization/types/counterpart-lookup.types'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

export interface TransferCustodyDialogProps {
  /** The LIVE custody row being transferred (`GET /custodies`). */
  custody: Custody
}

/**
 * The holder type this dialog can produce.
 *
 * The counterpart picker is employee-only (`operation: 'Issue'`, `type:
 * 'Employee'`), so the transfer target is always an Employee.
 */
const NEW_HOLDER_TYPE: CounterpartType = 'Employee'

/**
 * The custody kind that goes with a holder type.
 *
 * `Domain/Custodies/Custody.cs` pairs the two: a Personal custody is held by an
 * Employee, an Operational one by an OrganizationalUnit, Site or External party.
 * The server refuses a mismatched pair with 400
 * COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE, so the kind is derived from
 * the HOLDER — copying it from the custody being transferred sent every
 * transfer to an employee as an Operational custody and failed.
 */
function custodyKindForHolder(holderType: CounterpartType): CustodyKind {
  return holderType === 'Employee' ? 'Personal' : 'Operational'
}

/**
 * Custody responsibility transfer (e19-t05 / PRD §12.8 step 2 variant):
 * closes the current row and opens a new one for the chosen holder via the
 * live `POST /custodies/{custodyId}/transfer`. Composed on the custody detail
 * page.
 */
export function TransferCustodyDialog({ custody }: TransferCustodyDialogProps) {
  const [open, setOpen] = useState(false)
  const transferMutation = useTransferCustodyMutation()

  const methods = useForm<TransferCustodyFormValues>({
    resolver: zodResolver(transferCustodySchema) as Resolver<TransferCustodyFormValues>,
    defaultValues: { holderId: '', holderDisplayName: '', reason: '' },
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) {
      methods.reset({ holderId: '', holderDisplayName: '', reason: '' })
      transferMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open toggle
  }, [open])

  const submit = methods.handleSubmit((values) => {
    // Live wire for `POST /custodies/{custodyId}/transfer`:
    //   { subjectType, newHolderType, newHolderId, newCustodyKind, expectedRowVersion, note? }
    const request: TransferCustodyRequest = {
      subjectType: custody.subjectType,
      newHolderType: NEW_HOLDER_TYPE,
      newHolderId: values.holderId,
      newCustodyKind: custodyKindForHolder(NEW_HOLDER_TYPE),
      expectedRowVersion: custody.rowVersion,
      note:
        values.reason !== undefined && values.reason !== ''
          ? `${values.reason} (${values.holderDisplayName})`
          : `مبادلة مسؤولية إلى ${values.holderDisplayName}`,
    }
    transferMutation.mutate(
      { custodyId: custody.custodyId, request },
      { onSuccess: () => setOpen(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button">مبادلة المسؤولية</Button>} />
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>مبادلة مسؤولية العهدة</DialogTitle>
          <DialogDescription>
            يُغلق سطر العهدة الحالي ويُفتح سطر جديد بالحائز المحدد على الأصل{' '}
            <span dir="ltr" className="font-mono">
              {custody.assetNumber}
            </span>
            . الحائز الجديد موظف، لذلك تُفتح العهدة الجديدة كعهدة شخصية.
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
            <CounterpartSelectField
              control={methods.control}
              disabled={transferMutation.isPending}
            />
            <div className="grid gap-2">
              <label htmlFor="transfer-reason" className="text-sm font-medium text-foreground">
                السبب (اختياري)
              </label>
              <Input
                id="transfer-reason"
                {...methods.register('reason')}
                maxLength={300}
                placeholder="سبب المبادلة..."
                disabled={transferMutation.isPending}
              />
              {methods.formState.errors.reason !== undefined ? (
                <p role="alert" className="text-sm text-destructive">
                  {methods.formState.errors.reason.message}
                </p>
              ) : null}
            </div>
            {transferMutation.error !== null ? (
              <p role="alert" className="text-sm text-destructive">
                {/* The server's own code decides the wording: a 404 (a custody
                    outside the caller's scope) reads as "not found", never as
                    "unauthorized", and a row-version conflict names itself. */}
                {normalizeApiError(transferMutation.error).titleAr}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={transferMutation.isPending}>
                {transferMutation.isPending ? 'جارٍ المبادلة...' : 'تأكيد المبادلة'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
