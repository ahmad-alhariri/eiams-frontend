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
 * The candidates are restricted to units of the BASE unit's `unitType`. The
 * backend compares the source and base unit types case-insensitively and refuses
 * anything else with 400 `MATERIAL_UNIT_CONVERSIONS_UNIT_TYPE_MISMATCH`
 * ("The source and base units must have the same unit type"), so offering such a
 * unit is offering a request that cannot succeed — and the failure arrived as a
 * generic toast with nothing pointing at the cause.
 *
 * There is NO status field: a conversion is not a suspendable master record,
 * its lifecycle ends in DELETE, and the update route binds `factor` ONLY. So an
 * existing conversion shows its unit read-only — re-pointing the units means
 * remove-and-add rather than an edit.
 */
/** A unit may arrive without its type: compare what is there instead of dying on it. */
const normalizeUnitType = (unitType: string | null | undefined): string =>
  (unitType ?? '').trim().toLocaleLowerCase('ar')

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
  const baseUnit = useMemo(
    () => units.find((unit) => unit.id === material.baseUnitId),
    [material.baseUnitId, units],
  )
  /** The backend's comparison is case-insensitive, so the offer must be too. */
  const baseUnitType = normalizeUnitType(baseUnit?.unitType)
  const selectableUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.status === 'Active' &&
          unit.id !== material.baseUnitId &&
          !activeUnitIds.has(unit.id) &&
          normalizeUnitType(unit.unitType) === baseUnitType,
      ),
    [activeUnitIds, baseUnitType, material.baseUnitId, units],
  )
  /**
   * Two distinct "nothing to offer" cases, and they say different things: an
   * unknown base unit means the reference list did not answer, while an empty
   * candidate list means every same-type unit is already taken.
   */
  const noCandidatesMessage =
    baseUnit === undefined
      ? 'تعذّر تحديد نوع وحدة الأساس من قائمة الوحدات، أغلق النافذة وحاول مرة أخرى.'
      : 'لا توجد وحدة نشطة من نفس نوع وحدة الأساس متاحة، لأن التحويل يتطلب أن تكون وحدة المصدر ووحدة الأساس من النوع نفسه.'
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
        message:
          baseUnit === undefined
            ? 'تعذّر التحقق من نوع وحدة الأساس، أغلق النافذة وحاول مرة أخرى.'
            : 'اختر وحدة بديلة نشطة من نفس نوع وحدة الأساس وغير مرتبطة بهذه المادة.',
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
              : `وحدة أساس المادة هي ${material.baseUnitSymbol}. مثال: وحدة بديلة واحدة = 12 ${material.baseUnitSymbol}. لا يمكن اختيار وحدة من نوع مختلف عن وحدة الأساس.`}
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
                      <p className="text-sm text-muted-foreground">{noCandidatesMessage}</p>
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
