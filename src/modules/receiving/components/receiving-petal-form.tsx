import { useFormContext } from 'react-hook-form'
import { z } from 'zod'

import { useReceivingSuppliersLoader } from '@/modules/receiving/hooks/use-receiving-suppliers-loader'
import {
  RECEIVING_TYPES,
  RECEIVING_TYPE_LABELS_AR,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

// The section is a component file by contract; its schema contribution lives
// in ../schemas/receiving-info.schema.ts (e13-t01).
/* eslint-disable react-refresh/only-export-components */

/**
 * The `petal.receivingInfo.*` RHF group this section reads and writes. Pages
 * compose the spine group, this petal group, and the lines group into one
 * wider form; the section registers only the three names below.
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

interface SupplierSelectorControlProps {
  loadOptions: OptionLoader<string>
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
 * A trailing "create" row commits a typed supplier reference that has no
 * suggestion yet — the petal keeps free-text entry for suppliers that never
 * appeared in a document before.
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
      placeholder={scopeReady ? 'اكتب اسم المورد أو مرجعه...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد نتائج مطابقة."
      errorMessage="تعذر البحث عن الموردين."
      onCreate={(query) => onValueChange(query)}
      createLabel={(query) => `استخدام "${query}" كمورد`}
    />
  )
}

/**
 * ReceivingInfo petal editor (e13-t03). Composes the shared header spine via
 * the `petalSlot` render prop of {@link DocumentHeaderSection}; the supplier
 * reference autocompletes from the contract's distinct supplier references
 * (e13-t04) while the create row keeps free-text entry possible.
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
      <div className="grid gap-5 md:grid-cols-3">
        <FormField
          control={form.control}
          name="petal.receivingInfo.receivingType"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>نوع الاستلام</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-label="نوع الاستلام">
                  <SelectValue placeholder="اختر نوع الاستلام...">
                    {RECEIVING_TYPE_LABELS_AR[field.value as (typeof RECEIVING_TYPES)[number]] ??
                      'اختر نوع الاستلام...'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECEIVING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {RECEIVING_TYPE_LABELS_AR[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="petal.receivingInfo.supplierRef"
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
