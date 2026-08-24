import { useFormContext } from 'react-hook-form'

import type { TransferPetalContainer } from '@/modules/transfer/schemas/transfer-info.schema'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { Warehouse } from '@/shared/types/generated/eiams-v1'
import { FormField, FormItem, FormLabel, FormMessage, useFormField } from '@/shared/forms/form'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Textarea } from '@/shared/ui/textarea'

interface DestinationSelectorControlProps {
  /** The source warehouse id — excluded from the destination options. */
  sourceWarehouseId: string | undefined
  value: string
  disabled: boolean
  onValueChange: (selection: { id: string; displayName: string } | null) => void
}

/**
 * Scoped destination-warehouse picker. Uses the shared scoped selector and
 * filters out the source warehouse client-side — transferring a document's
 * stock to its own source warehouse is meaningless.
 */
function DestinationSelectorControl({
  sourceWarehouseId,
  value,
  disabled,
  onValueChange,
}: DestinationSelectorControlProps) {
  const { formItemId } = useFormField()
  const selector = useScopedWarehouseSelector()

  return (
    <AsyncSelect<Warehouse>
      value={value === '' ? null : value}
      loadOptions={async (query) => {
        const options = await selector.loadOptions(query)
        return options.filter((option) => option.value !== sourceWarehouseId)
      }}
      onValueChange={(next, option) =>
        onValueChange(
          next === null || option === undefined ? null : { id: next, displayName: option.label },
        )
      }
      disabled={disabled || !selector.scopeReady}
      inputProps={{
        id: formItemId,
        'aria-label': 'مستودع الوجهة',
      }}
      placeholder={selector.scopeReady ? 'ابحث عن مستودع الوجهة...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد مستودعات نشطة مطابقة ضمن نطاقك."
      errorMessage="تعذر البحث عن المستودعات ضمن نطاقك."
    />
  )
}

export interface TransferDestinationSectionProps {
  /**
   * The form's source warehouse id (`header.warehouseId`). Excluded from the
   * destination options.
   */
  sourceWarehouseId?: string
  /** Disables every editable control; the controls stay registered. */
  disabled?: boolean
}

/**
 * TransferInfo petal editor (e17-t03). Registers the destination warehouse
 * capture and the transfer reason under the page's `petal.transferInfo.*`
 * name prefix, plus the selection-time `destinationWarehouseName` sibling
 * (declared in `TransferPetalContainer`, transfer-info.schema.ts).
 *
 * RHF contract: reads and writes the page's form context through
 * useFormContext — pages compose the spine group, this petal group, and the
 * lines group into one wider form.
 */
export function TransferDestinationSection({
  sourceWarehouseId,
  disabled = false,
}: TransferDestinationSectionProps) {
  const form = useFormContext<TransferPetalContainer>()

  return (
    <fieldset
      data-slot="transfer-destination-section"
      disabled={disabled}
      className="grid gap-5 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-foreground">جهة التحويل</legend>
      <div className="grid gap-5 md:grid-cols-2">
        <FormField
          control={form.control}
          name="petal.transferInfo.destinationWarehouseId"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>مستودع الوجهة</FormLabel>
              <DestinationSelectorControl
                sourceWarehouseId={sourceWarehouseId}
                value={field.value}
                disabled={disabled}
                onValueChange={(selection) => {
                  field.onChange(selection?.id ?? '')
                  if (selection !== null && selection.id !== field.value) {
                    form.setValue('petal.destinationWarehouseName', selection.displayName, {
                      shouldValidate: false,
                    })
                  }
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="petal.transferInfo.transferReason"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>سبب التحويل</FormLabel>
              <Textarea
                {...field}
                rows={2}
                maxLength={500}
                placeholder="سبب تحويل المواد..."
                aria-label="سبب التحويل"
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </fieldset>
  )
}
