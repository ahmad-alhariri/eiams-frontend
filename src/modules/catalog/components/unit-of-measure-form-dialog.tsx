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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const EMPTY_VALUES: UnitOfMeasureFormValues = {
  code: '',
  nameAr: '',
  descriptionAr: null,
  nominalConversionFactor: 1,
  baseUnitId: null,
  status: 'Active',
}

export interface UnitOfMeasureFormDialogProps {
  unit: UnitOfMeasure | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UnitOfMeasureFormValues) => Promise<void>
}

/** Create and edit a unit without introducing unit-conversion behavior. */
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
      code: unit?.code ?? '',
      nameAr: unit?.nameAr ?? '',
      descriptionAr: unit?.descriptionAr ?? null,
      nominalConversionFactor: unit?.nominalConversionFactor ?? 1,
      baseUnitId: unit?.baseUnitId ?? null,
      status: unit?.status ?? 'Active',
    })
  }, [form, open, unit])

  const submit = async (values: UnitOfMeasureFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: [
          'code',
          'nameAr',
          'descriptionAr',
          'nominalConversionFactor',
          'baseUnitId',
          'status',
        ],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{unit ? 'تعديل وحدة القياس' : 'إضافة وحدة قياس'}</DialogTitle>
          <DialogDescription>
            أدخل البيانات المرجعية للوحدة. تُدار تحويلات الوحدات من شاشة مستقلة.
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
                name="nameAr"
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
                name="code"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الرمز</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" disabled={isPending} placeholder="EA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nominalConversionFactor"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عامل التحويل</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        dir="ltr"
                        disabled={isPending}
                        value={field.value}
                        onChange={(event) => field.onChange(event.currentTarget.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                rules={{ required: true }}
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue>{field.value === 'Active' ? 'نشط' : 'غير نشط'}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">نشط</SelectItem>
                        <SelectItem value="Inactive">غير نشط</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="descriptionAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الوصف (اختياري)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.currentTarget.value || null)}
                      disabled={isPending}
                      placeholder="وصف مختصر لوحدة القياس"
                    />
                  </FormControl>
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
