import { useFormContext } from 'react-hook-form'
import { z } from 'zod'

import { useReceivingSuppliersLoader } from '@/modules/receiving/hooks/use-receiving-suppliers-loader'
import type { SupplierSuggestion } from '@/modules/receiving/services/receiving.service'
import {
  receivingInfoSchema,
  type ReceivingInfoFormValues,
} from '@/modules/receiving/schemas/receiving-info.schema'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Input } from '@/shared/ui/input'

// The section is a component file by contract; its schema contribution lives
// in ../schemas/receiving-info.schema.ts (e13-t01).
/* eslint-disable react-refresh/only-export-components */

/**
 * The `petal.receivingInfo.*` RHF group this section reads and writes. Pages
 * compose the spine group, this petal group, and the lines group into one
 * wider form; the section registers only the two names below.
 *
 * There is no `receivingType` control: the live write carries no receiving type
 * (`CompleteWarehouseDocumentDraftCommandHandler` fixes `ReceivingType.Supplier`
 * server-side), so a control for it would validate a value that reaches no
 * server state. The read projection still returns it and the detail petal still
 * renders its Arabic label.
 */
export interface ReceivingPetalContainer {
  petal: {
    receivingInfo: ReceivingInfoFormValues
  }
}

/** The petal group of the receiving document form (header + lines + petal). */
export const receivingPetalFormSchema = z.object({
  petal: z.object({
    receivingInfo: receivingInfoSchema,
  }),
})

export type ReceivingPetalFormValues = z.infer<typeof receivingPetalFormSchema>

/** Shared schema.md length; the invoice input enforces it while typing. */
const SUPPLIER_INVOICE_REF_MAX_LENGTH = 100

export interface ReceivingPetalFormProps {
  /** Disables every editable control; the controls stay registered. */
  disabled?: boolean
}

/**
 * Supplier selector control props. The combobox commits the supplier's
 * external-party id, which is what the draft write binds as `SupplierPartyId`.
 */
interface SupplierSelectorControlProps {
  loadOptions: OptionLoader<SupplierSuggestion>
  scopeReady: boolean
  disabled: boolean
  value: string
  onValueChange: (value: string) => void
}

/**
 * AsyncSelect wiring the shared FormItem owns: the combobox inputs a raw id and
 * aria attributes itself, so the control wires them from `useFormField()`
 * instead of going through FormControl's cloneElement.
 *
 * There is deliberately no `onCreate` row: a typed free-text supplier has no
 * external-party id, so committing it would save a draft the server cannot bind.
 */
function SupplierSelectorControl({
  loadOptions,
  scopeReady,
  disabled,
  value,
  onValueChange,
}: SupplierSelectorControlProps) {
  const { error, formDescriptionId, formItemId, formMessageId, required } = useFormField()
  return (
    <AsyncSelect
      value={value === '' ? null : value}
      loadOptions={loadOptions}
      onValueChange={(nextValue) => onValueChange(nextValue ?? '')}
      disabled={disabled || !scopeReady}
      inputProps={{
        id: formItemId,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby':
          [formDescriptionId, error ? formMessageId : ''].filter(Boolean).join(' ') || undefined,
      }}
      placeholder={scopeReady ? 'ابحث عن مورد ضمن نطاقك...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد نتائج مطابقة."
      errorMessage="تعذر البحث عن الموردين."
    />
  )
}

/**
 * ReceivingInfo petal editor (e13-t03). Composes the shared header spine via
 * the `petalSlot` render prop of {@link DocumentHeaderSection}; the supplier is
 * picked from the live `GET /receiving-infos/suppliers` suggestions, which carry
 * the external-party id the write binds.
 *
 * RHF contract: reads and writes the page's form context through the
 * `petal.receivingInfo.` name prefix, mirroring `DocumentPetals<Receiving>`.
 */
export function ReceivingPetalForm({ disabled = false }: ReceivingPetalFormProps) {
  const form = useFormContext<ReceivingPetalContainer>()
  const { loadOptions, scopeReady } = useReceivingSuppliersLoader()

  return (
    <fieldset
      data-slot="receiving-petal-form"
      disabled={disabled}
      className="grid gap-5 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-foreground">بيانات الاستلام</legend>
      <div className="grid gap-5 md:grid-cols-2">
        <FormField
          control={form.control}
          name="petal.receivingInfo.supplierPartyId"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>المورد</FormLabel>
              <SupplierSelectorControl
                loadOptions={loadOptions}
                scopeReady={scopeReady}
                disabled={disabled}
                value={field.value}
                onValueChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="petal.receivingInfo.supplierInvoiceRef"
          render={({ field }) => (
            <FormItem>
              <FormLabel>رقم فاتورة المورد</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  dir="ltr"
                  disabled={disabled}
                  maxLength={SUPPLIER_INVOICE_REF_MAX_LENGTH}
                  placeholder="اختياري..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </fieldset>
  )
}
