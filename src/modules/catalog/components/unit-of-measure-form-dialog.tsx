import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  unitOfMeasureSchema,
  type UnitOfMeasureFormValues,
} from '@/modules/catalog/schemas/unit-of-measure.schemas'
import type { UnitOfMeasure } from '@/modules/catalog/types/catalog.types'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

const EMPTY_VALUES: UnitOfMeasureFormValues = { name: '', symbol: '', unitType: '' }

export interface UnitOfMeasureFormDialogProps {
  unit: UnitOfMeasure | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UnitOfMeasureFormValues) => Promise<void>
}

/**
 * Create and edit a unit of measure.
 *
 * The projection is exactly `{ id, name, symbol, unitType, status }` — no
 * `code`, no `descriptionAr`, no `nominalConversionFactor`, no `baseUnitId`.
 * Conversion between units lives on the MATERIAL (`MaterialUnitConversion`), so
 * this form carries the three fields the create and update routes bind and
 * nothing else. `status` is a separate guarded command whose body is an
 * INTEGER ordinal, so it is an action on the list row rather than a field here.
 */
export function UnitOfMeasureFormDialog({
  unit,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: UnitOfMeasureFormDialogProps) {
  const form = useForm<UnitOfMeasureFormValues>({
    resolver: zodResolver(unitOfMeasureSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      name: unit?.name ?? '',
      symbol: unit?.symbol ?? '',
      unitType: unit?.unitType ?? '',
    })
  }, [form, open, unit])

  const submit = async (values: UnitOfMeasureFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['name', 'symbol', 'unitType'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{unit ? 'تعديل وحدة القياس' : 'إضافة وحدة قياس'}</DialogTitle>
          <DialogDescription>
            أدخل البيانات المرجعية للوحدة. تُدار تحويلات الوحدات لكل مادة على حدة من شاشة المادة،
            ولا يوجد عامل تحويل عام للوحدة.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الوحدة</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="مثال: قطعة" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="symbol"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رمز الوحدة</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" disabled={isPending} placeholder="EA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="unitType"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع الوحدة</FormLabel>
                  <FormControl>
                    <Input {...field} dir="ltr" disabled={isPending} placeholder="Quantity" />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">
                    نص حر يحدده النظام، مثل الكمية أو الوزن أو الطول.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {unit ? 'حفظ التعديلات' : 'إضافة الوحدة'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
