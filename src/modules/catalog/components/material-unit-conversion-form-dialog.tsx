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

const EMPTY_VALUES: MaterialUnitConversionFormValues = {
  unitId: '',
  conversionFactor: 1,
  status: 'Active',
}

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
          unit.unitId !== material.unit.id &&
          !activeUnitIds.has(unit.unitId),
      ),
    [activeUnitIds, material.unit.id, units],
  )
  const form = useForm<MaterialUnitConversionFormValues>({
    resolver: zodResolver(materialUnitConversionSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      unitId: conversion?.unit.id ?? '',
      conversionFactor: conversion?.conversionFactor ?? 1,
      status: conversion?.status ?? 'Active',
    })
  }, [conversion, form, open])

  const submit = async (values: MaterialUnitConversionFormValues) => {
    if (conversion === null && !selectableUnits.some((unit) => unit.unitId === values.unitId)) {
      form.setError('unitId', {
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
        schemaKeys: ['unitId', 'conversionFactor', 'status'],
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
              ? 'يبقى التحويل مرتبطًا بالمادة ووحدة أساسها فقط.'
              : `وحدة أساس المادة هي ${material.unit.displayName}. مثال: كرتونة واحدة = 12 ${material.unit.displayName}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            {conversion ? (
              <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-sm font-medium text-muted-foreground">الوحدة البديلة</span>
                <span className="font-semibold text-foreground">{conversion.unit.displayName}</span>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="unitId"
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
                            {selectableUnits.find((unit) => unit.unitId === field.value)?.nameAr ??
                              'اختر الوحدة البديلة'}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectableUnits.map((unit) => (
                          <SelectItem key={unit.unitId} value={unit.unitId}>
                            {unit.nameAr}
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
                        لا توجد وحدة نشطة متاحة بعد استبعاد وحدة الأساس والتحويلات النشطة.
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="conversionFactor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>عامل التحويل إلى {material.unit.displayName}</FormLabel>
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
                    وحدة بديلة واحدة = العامل × {material.unit.displayName}.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {conversion ? (
              <FormField
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue>
                            {field.value === 'Active' ? 'نشط' : 'مؤرشف (غير نشط)'}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">نشط</SelectItem>
                        <SelectItem value="Inactive">مؤرشف (غير نشط)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

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
