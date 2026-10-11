import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import {
  materialUnitConversionSchema,
  type MaterialUnitConversionFormValues,
} from '@/modules/catalog/schemas/material-unit-conversion.schemas'
import type {
  Material,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.types'
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

const EMPTY_VALUES: MaterialUnitConversionFormValues = { fromUnitId: '', factor: 1 }

type MaterialUnitConversionFormDialogProps = {
  material: Material
  conversion: MaterialUnitConversion | null
  activeUnitIds: ReadonlySet<string>
  units: readonly UnitOfMeasure[]
  isUnitsLoading: boolean
  isUnitsError: boolean
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialUnitConversionFormValues) => Promise<void>
}

/**
 * Edits one material-specific alternative unit. The base unit is supplied by
 * the server and is never a selectable conversion target.
 *
 * There is NO status field: a conversion is not a suspendable master record,
 * its lifecycle ends in DELETE, and the update route binds `factor` ONLY. So an
 * existing conversion shows its unit read-only — re-pointing the units means
 * remove-and-add rather than an edit.
 */
export function MaterialUnitConversionFormDialog({
  material,
  conversion,
  activeUnitIds,
  units,
  isUnitsLoading,
  isUnitsError,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialUnitConversionFormDialogProps) {
  const selectableUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.status === 'Active' &&
          unit.id !== material.baseUnitId &&
          !activeUnitIds.has(unit.id),
      ),
    [activeUnitIds, material.baseUnitId, units],
  )
  const form = useForm<MaterialUnitConversionFormValues>({
    resolver: zodResolver(materialUnitConversionSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      fromUnitId: conversion?.fromUnitId ?? '',
      factor: conversion?.factor ?? 1,
    })
  }, [conversion, form, open])

  const submit = async (values: MaterialUnitConversionFormValues) => {
    if (conversion === null && !selectableUnits.some((unit) => unit.id === values.fromUnitId)) {
      form.setError('fromUnitId', {
        message: 'اختر وحدة بديلة نشطة وغير مكررة لهذه المادة.',
      })
      return
    }

    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['fromUnitId', 'factor'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{conversion ? 'تعديل تحويل وحدة' : 'إضافة وحدة بديلة'}</DialogTitle>
          <DialogDescription>
            {conversion
              ? `يبقى التحويل مرتبطًا بالمادة ووحدة أساسها ${material.baseUnitSymbol} فقط.`
              : `وحدة أساس المادة هي ${material.baseUnitSymbol}. مثال: كرتونة واحدة = 12 ${material.baseUnitSymbol}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            {conversion === null ? (
              <FormField
                control={form.control}
                name="fromUnitId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الوحدة البديلة</FormLabel>
                    <Select
                      value={field.value}
                      disabled={isPending || isUnitsLoading}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue>
                            {selectableUnits.find((unit) => unit.id === field.value)?.name ??
                              'اختر الوحدة البديلة'}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectableUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isUnitsError ? (
                      <p className="text-sm text-destructive" role="alert">
                        تعذّر تحميل وحدات القياس. أغلق النافذة وحاول مرة أخرى.
                      </p>
                    ) : null}
                    {!isUnitsLoading && !isUnitsError && selectableUnits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        لا توجد وحدة نشطة متاحة بعد استبعاد وحدة الأساس والوحدات المرتبطة.
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-sm font-medium text-muted-foreground">الوحدة البديلة</span>
                <span className="font-semibold text-foreground">
                  {units.find((unit) => unit.id === conversion.fromUnitId)?.name ??
                    conversion.fromUnitId}
                </span>
              </div>
            )}

            <FormField
              control={form.control}
              name="factor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>عامل التحويل إلى {material.baseUnitSymbol}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      dir="ltr"
                      aria-describedby="conversion-factor-help"
                      disabled={isPending}
                      value={field.value}
                      onChange={(event) => field.onChange(event.currentTarget.valueAsNumber)}
                    />
                  </FormControl>
                  <p id="conversion-factor-help" className="text-sm text-muted-foreground">
                    وحدة بديلة واحدة = العامل × {material.baseUnitSymbol}.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {conversion ? 'حفظ التعديلات' : 'إضافة التحويل'}
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
