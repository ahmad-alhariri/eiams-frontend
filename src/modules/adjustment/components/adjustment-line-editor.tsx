import { useFieldArray, useFormContext, Controller } from 'react-hook-form'

import type { AdjustmentFormValues } from '@/modules/adjustment/schemas/adjustment-form.schemas'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

/**
 * Signed adjustment-line editor (e21-t05), mounted under the page's form
 * context (`lines.*`). Purely presentational — it never mutates the array
 * imperatively; CountVariance rows are SEEDED BY THE PAGE through form
 * `defaultValues` (initialization, not mutation), which keeps React Hook
 * Form's field registry and values in lockstep.
 *
 * Two render modes driven by the parent:
 * - `DirectCorrection`: free rows — material picker, signed delta, reason,
 *   add/remove.
 * - `CountVariance`: every row renders read-only material + signed delta
 *   (server-authoritative per D-ADJ-01); only the reason is editable. An
 *   asset reference rides solely when the server count line carried one —
 *   this editor never accepts free-text asset identities.
 */
export function AdjustmentLineEditor({
  purpose,
  disabled,
}: {
  purpose: AdjustmentFormValues['header']['purpose']
  disabled?: boolean
}) {
  const { control } = useFormContext<AdjustmentFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const isSubmitting = disabled === true
  const isVarianceMode = purpose === 'CountVariance'

  return (
    <section
      data-slot="adjustment-lines-section"
      aria-label="بنود الفروقات"
      className="grid gap-3 rounded-md border border-border p-4"
    >
      <h2 className="text-sm font-medium text-foreground">بنود الفروقات</h2>
      {isVarianceMode ? (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          المواد وفروق الكميات منسوخة من جلسة الجرد ولا تُعدَّل هنا؛ سجّل سبب كل فرق قبل الحفظ.
        </p>
      ) : null}
      {!isVarianceMode && fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد بنود بعد؛ أضف بنداً للبدء.</p>
      ) : null}

      {fields.map((field, index) => (
        <div
          key={field.id}
          data-slot="adjustment-line-row"
          className="grid items-start gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
        >
          <MaterialCell index={index} readOnly={isVarianceMode} />
          <DeltaCell index={index} readOnly={isVarianceMode} />
          <ReasonCell index={index} />
          {!isVarianceMode ? (
            <Button
              type="button"
              variant="outline"
              className="mt-6"
              disabled={isSubmitting || fields.length === 1}
              onClick={() => remove(index)}
              aria-label={`إزالة البند ${index + 1}`}
            >
              إزالة
            </Button>
          ) : null}
        </div>
      ))}

      {!isVarianceMode ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={() => append(emptyLine())}
        >
          إضافة بند
        </Button>
      ) : null}
    </section>
  )
}

/** Blank DirectCorrection row appended by the editor's own button. */
function emptyLine() {
  return { materialId: '', materialNameAr: '', quantityDelta: 0, reason: '' }
}

function MaterialCell({ index, readOnly }: { index: number; readOnly?: boolean }) {
  const { control, watch, setValue } = useFormContext<AdjustmentFormValues>()
  const materialSelector = useScopedMaterialSelector()
  const line = watch(`lines.${index}`)

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <Label>المادة</Label>
        <p
          data-slot="adjustment-line-material-readonly"
          className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm"
        >
          {line?.materialNameAr || '—'}
          {line?.assetId !== undefined && line.assetId !== '' ? (
            <span className="ms-2 text-xs text-muted-foreground" dir="ltr">
              أصل مرتبط بالجرد
            </span>
          ) : null}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`line-material-${index}`}>المادة</Label>
      <Controller
        control={control}
        name={`lines.${index}.materialId`}
        render={({ field: materialField }) => (
          <AsyncSelect
            value={materialField.value || null}
            onValueChange={(value, option) => {
              materialField.onChange(value ?? '')
              setValue(
                `lines.${index}.materialNameAr`,
                (option?.payload as { nameAr?: string } | undefined)?.nameAr ?? option?.label ?? '',
                { shouldValidate: false },
              )
            }}
            loadOptions={materialSelector.loadOptions}
            placeholder="ابحث عن المادة..."
            inputProps={{ 'aria-label': `مادة البند ${index + 1}` }}
          />
        )}
      />
    </div>
  )
}

function DeltaCell({ index, readOnly }: { index: number; readOnly?: boolean }) {
  const { register, watch } = useFormContext<AdjustmentFormValues>()
  const rawValue = watch(`lines.${index}.quantityDelta`)

  if (readOnly) {
    const signed = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    return (
      <div className="flex flex-col gap-1">
        <Label>فرق الكمية (+/−)</Label>
        <p className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm" dir="ltr">
          {Number.isFinite(signed) ? signed : '—'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`line-delta-${index}`}>فرق الكمية (+/−)</Label>
      <Input
        id={`line-delta-${index}`}
        type="number"
        step="any"
        dir="ltr"
        {...register(`lines.${index}.quantityDelta`)}
      />
    </div>
  )
}

function ReasonCell({ index }: { index: number }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<AdjustmentFormValues>()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`line-reason-${index}`}>سبب الفرق</Label>
      <Textarea
        id={`line-reason-${index}`}
        rows={2}
        {...register(`lines.${index}.reason`)}
        placeholder="سبب إلزامي لكل فرق"
      />
      {errors.lines?.[index]?.reason ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.lines[index]?.reason?.message}
        </p>
      ) : null}
    </div>
  )
}
