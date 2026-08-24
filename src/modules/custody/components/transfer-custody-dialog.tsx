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
import type { CustodyMutationRequest } from '@/modules/custody/types/custody.types'
import { createIdempotencyKey } from '@/shared/services/mutation-safety'
import type { AssetCustody } from '@/shared/types/generated/eiams-v1'
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
  custody: AssetCustody
}

/**
 * Custody responsibility transfer (e19-t05 / PRD §12.8 step 2 variant):
 * closes the current row and opens a new one for the chosen holder via the
 * idempotent transfer mutation. Composed on the custody detail page.
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
    const request: CustodyMutationRequest = {
      subjectType: 'Asset',
      assetId: custody.assetId,
      custodyKind: custody.custodyKind,
      effectiveAt: new Date().toISOString(),
      holderId: values.holderId,
      holderType: 'Employee',
      issueDocumentId: custody.issueDocumentId,
      reason:
        values.reason !== undefined && values.reason !== ''
          ? `${values.reason} (${values.holderDisplayName})`
          : `مبادلة مسؤولية إلى ${values.holderDisplayName}`,
      rowVersion: custody.rowVersion,
    }
    transferMutation.mutate(
      { custodyId: custody.custodyId, request, idempotencyKey: createIdempotencyKey() },
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
            .
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
                تعذّر إتمام المبادلة. تحقق من البيانات وحاول مرة أخرى.
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
