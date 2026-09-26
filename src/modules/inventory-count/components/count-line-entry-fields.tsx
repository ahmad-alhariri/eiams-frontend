import { useFormContext } from 'react-hook-form'

import {
  useCountLineDraftValue,
  useCountLineDrafts,
} from '@/modules/inventory-count/components/count-line-drafts'
import { countLineDraftField } from '@/modules/inventory-count/components/count-quantity-workspace.model'
import type { CountLineEntryFormValues } from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import { countLineDifference } from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/utils/class-names'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/**
 * The «الكمية الفعلية» / «الفرق» / «سبب الفرق» cells for one row of the
 * current server page (hbfu). All three read and write the page's React Hook
 * Form through its context, so Arabic validation, the live difference preview
 * and the unsaved-draft guard all come from one form.
 *
 * D-MAT-01: an asset line counts a serialized asset, so it is verified as
 * present (1) or missing (0) and is never coerced into a free numeric input.
 */
export interface CountLineEntryFieldsProps {
  /** Index of the row inside the current page's `lines` form array. */
  index: number
  line: InventoryCountLine
  /** True when the operator lacks `count.enter` or a save is in flight. */
  disabled: boolean
}

function CountLineQuantityField({ disabled, index, line }: CountLineEntryFieldsProps) {
  const { control, formState, setValue } = useFormContext<CountLineEntryFormValues>()
  const value = useCountLineDraftValue(control, index, 'actualQuantity')
  const errorMessage = formState.errors.lines?.[index]?.actualQuantity?.message
  const materialName = line.material.displayName

  if (isAssetCountLine(line)) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={value === '1' ? 'default' : 'outline'}
          aria-label={`تأكيد وجود ${materialName}`}
          aria-pressed={value === '1'}
          disabled={disabled}
          onClick={() =>
            setValue(countLineDraftField('actualQuantity', index), '1', {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          موجود
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === '0' ? 'destructive' : 'outline'}
          aria-label={`تأكيد فقدان ${materialName}`}
          aria-pressed={value === '0'}
          disabled={disabled}
          onClick={() =>
            setValue(countLineDraftField('actualQuantity', index), '0', {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          مفقود
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        aria-label={`الكمية الفعلية لـ ${materialName}`}
        aria-invalid={errorMessage !== undefined}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          setValue(countLineDraftField('actualQuantity', index), event.target.value, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        className="w-32"
      />
      {errorMessage !== undefined ? (
        <span role="alert" className="text-xs text-destructive">
          {errorMessage}
        </span>
      ) : null}
    </div>
  )
}

function CountLineReasonField({ disabled, index, line }: CountLineEntryFieldsProps) {
  const { control, formState, setValue } = useFormContext<CountLineEntryFormValues>()
  const value = useCountLineDraftValue(control, index, 'reason')
  const errorMessage = formState.errors.lines?.[index]?.reason?.message

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="text"
        aria-label={`سبب الفرق لـ ${line.material.displayName}`}
        aria-invalid={errorMessage !== undefined}
        placeholder="سبب الفرق"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          setValue(countLineDraftField('reason', index), event.target.value, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        className="w-48"
      />
      {errorMessage !== undefined ? (
        <span role="alert" className="text-xs text-destructive">
          {errorMessage}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Live difference preview. An uncounted or unusable entry shows «—» rather
 * than a fabricated number, so the table can never display a difference the
 * save path would reject.
 */
function CountLineDifferenceField({ index, line }: { index: number; line: InventoryCountLine }) {
  const { control } = useFormContext<CountLineEntryFormValues>()
  const drafts = useCountLineDrafts(control)
  const difference = countLineDifference(line, drafts[index]?.actualQuantity ?? '')

  return (
    <span className={cn('ltr', difference !== null && difference !== 0 && 'text-destructive')}>
      {difference === null ? '—' : difference}
    </span>
  )
}

export { CountLineDifferenceField, CountLineQuantityField, CountLineReasonField }
