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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

export interface TransferCustodyDialogProps {
  /** The LIVE custody row being transferred (`GET /custodies`). */
  custody: Custody
}

/**
 * The holder kinds this dialog may target.
 *
 * The live counterpart lookup serves all of them for a transfer:
 * `GET /counterparts?operation=Transfer&type=<kind>` answers every `PartyType`
 * value, because the backend validator restricts `type` only for `Receiving`
 * (→ External) and `Issue` (→ internal parties). Each kind was proved live by
 * a real transfer on 2026-10-22.
 */
const HOLDER_TYPES: readonly CounterpartType[] = [
  'Employee',
  'OrganizationalUnit',
  'Site',
  'External',
]

/** Arabic labels of the holder kinds (the issue recipient wording). */
const HOLDER_TYPE_LABELS_AR: Readonly<Record<CounterpartType, string>> = {
  Employee: 'موظف',
  OrganizationalUnit: 'وحدة تنظيمية',
  Site: 'موقع',
  External: 'جهة خارجية',
}

/** The id of the holder-type select, bound by its `<label>`. */
const HOLDER_TYPE_FIELD_ID = 'transfer-custody-holder-type'

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
  const [holderType, setHolderType] = useState<CounterpartType>('Employee')
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
      newHolderType: holderType,
      newHolderId: values.holderId,
      newCustodyKind: custodyKindForHolder(holderType),
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A reopened dialog starts from the default holder kind.
        if (next) setHolderType('Employee')
        setOpen(next)
      }}
    >
      <DialogTrigger render={<Button type="button">مبادلة المسؤولية</Button>} />
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>مبادلة مسؤولية العهدة</DialogTitle>
          <DialogDescription>
            يُغلق سطر العهدة الحالي ويُفتح سطر جديد بالحائز المحدد على الأصل{' '}
            <span dir="ltr" className="font-mono">
              {custody.assetNumber}
            </span>
            . نوع الحائز يحدد نوع العهدة: الموظف عهدة شخصية، والوحدة التنظيمية أو الموقع أو الجهة
            الخارجية عهدة تشغيلية.
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
            <div className="grid gap-2">
              <label htmlFor={HOLDER_TYPE_FIELD_ID} className="text-sm font-medium text-foreground">
                نوع الحائز الجديد
              </label>
              <Select
                value={holderType}
                onValueChange={(nextType) => {
                  if (nextType === null || nextType === holderType) return
                  setHolderType(nextType)
                  // A holder captured for one kind is meaningless for the next.
                  methods.setValue('holderId', '')
                  methods.setValue('holderDisplayName', '')
                }}
                disabled={transferMutation.isPending}
              >
                <SelectTrigger id={HOLDER_TYPE_FIELD_ID}>
                  <SelectValue placeholder="اختر نوع الحائز...">
                    {HOLDER_TYPE_LABELS_AR[holderType]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOLDER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {HOLDER_TYPE_LABELS_AR[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* The picker is remounted per holder kind: the shared selector
                keeps the options it loaded last, and a Site list offered for an
                Employee would hand the server a holder of the wrong kind. */}
            <CounterpartSelectField
              key={holderType}
              control={methods.control}
              disabled={transferMutation.isPending}
              operation="Transfer"
              type={holderType}
              label="الحائز الجديد"
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
