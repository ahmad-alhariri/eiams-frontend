import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  materialFormSchema,
  type MaterialFormValues,
} from '@/modules/catalog/schemas/material.schemas'
import type { Material, MaterialFamily, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
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
import { Textarea } from '@/shared/ui/textarea'

type MaterialKind = Material['materialKind']

const EMPTY_VALUES: MaterialFormValues = {
  code: '',
  nameAr: '',
  descriptionAr: null,
  materialFamilyId: '',
  unitId: '',
  status: 'Active',
  materialKind: 'Consumable',
  nominalConversionFactor: 1,
}

export interface MaterialFormDialogProps {
  families: readonly MaterialFamily[]
  isReferencesError: boolean
  isReferencesLoading: boolean
  isPending: boolean
  material: Material | null
  open: boolean
  units: readonly UnitOfMeasure[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialFormValues) => Promise<void>
}

function isMaterialKind(value: string | null): value is MaterialKind {
  return value === 'Consumable' || value === 'Asset'
}

/** Contract-backed core form with the approved material tracking matrix. */
export function MaterialFormDialog({
  families,
  isReferencesError,
  isReferencesLoading,
  isPending,
  material,
  open,
  units,
  onOpenChange,
  onSubmit,
}: MaterialFormDialogProps) {
  const { confirm, element: confirmElement } = useConfirm()
  const selectableFamilies = families.filter(
    (family) =>
      family.status === 'Active' || family.materialFamilyId === material?.materialFamily.id,
  )
  const selectableUnits = units.filter(
    (unit) => unit.status === 'Active' || unit.unitId === material?.unit.id,
  )
  const referencesUnavailable =
    isReferencesLoading ||
    isReferencesError ||
    selectableFamilies.length === 0 ||
    selectableUnits.length === 0
  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    const materialKind = material?.materialKind ?? 'Consumable'
    form.reset({
      code: material?.code ?? '',
      nameAr: material?.nameAr ?? '',
      descriptionAr: material?.descriptionAr ?? null,
      materialFamilyId: material?.materialFamily.id ?? '',
      unitId: material?.unit.id ?? '',
      nominalConversionFactor: material?.nominalConversionFactor ?? 1,
      materialKind,
      status: material?.status ?? 'Active',
    })
  }, [form, material, open])

  const handleMaterialKindChange = useCallback(
    async (nextValue: string | null) => {
      if (!isMaterialKind(nextValue) || nextValue === form.getValues('materialKind')) return

      const result = await confirm({
        title: 'تأكيد تغيير نوع المادة',
        message:
          'سيُعاد ضبط متطلب رقم الأصل وفق السياسة المعتمدة. تابع فقط إذا كان التصنيف الجديد صحيحاً.',
        confirmLabel: 'تغيير النوع',
        cancelLabel: 'إلغاء',
      })
      if (!result.confirmed) return

      form.setValue('materialKind', nextValue, { shouldDirty: true, shouldValidate: true })
    },
    [confirm, form],
  )

  const submit = async (values: MaterialFormValues) => {
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
          'materialFamilyId',
          'unitId',
          'nominalConversionFactor',
          'materialKind',
          'status',
        ],
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{material ? 'تعديل مادة' : 'إضافة مادة'}</DialogTitle>
            <DialogDescription>
              أدخل بيانات المادة الأساسية. يطبق النموذج تلقائياً سياسة رقم الأصل المعتمدة حسب نوع
              المادة.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              aria-busy={isPending}
              className="grid gap-5"
              onSubmit={form.handleSubmit(submit)}
            >
              <FormField
                control={form.control}
                name="nameAr"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم المادة</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending}
                        maxLength={250}
                        placeholder="مثال: حاسوب مكتبي"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رمز المادة</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          dir="ltr"
                          disabled={isPending}
                          maxLength={50}
                          placeholder="IT-HW-PC-001"
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
                      <Select
                        value={field.value}
                        disabled={isPending}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue>
                              {field.value === 'Active' ? 'نشطة' : 'غير نشطة'}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active">نشطة</SelectItem>
                          <SelectItem value="Inactive">غير نشطة</SelectItem>
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
                    <FormLabel>وصف المادة</FormLabel>
                    <FormControl>
                      <Textarea
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.currentTarget.value || null)}
                        disabled={isPending}
                        maxLength={1000}
                        placeholder="وصف اختياري للمادة"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="materialFamilyId"
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>عائلة المادة</FormLabel>
                      <Select
                        value={field.value}
                        disabled={isPending || referencesUnavailable}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue>
                              {selectableFamilies.find(
                                (family) => family.materialFamilyId === field.value,
                              )?.nameAr ?? 'اختر عائلة المادة'}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectableFamilies.map((family) => (
                            <SelectItem
                              key={family.materialFamilyId}
                              value={family.materialFamilyId}
                            >
                              {family.nameAr}
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
                  name="unitId"
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>وحدة القياس الأساسية</FormLabel>
                      <Select
                        value={field.value}
                        disabled={isPending || referencesUnavailable}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue>
                              {selectableUnits.find((unit) => unit.unitId === field.value)
                                ?.nameAr ?? 'اختر وحدة القياس'}
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                    <p className="text-sm text-muted-foreground">
                      كمية وحدة واحدة من هذه المادة بالوحدة الأساسية.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isReferencesError ? (
                <p className="text-sm text-destructive" role="alert">
                  تعذّر تحميل عائلات المواد أو وحدات القياس. أغلق النافذة وحاول مرة أخرى.
                </p>
              ) : null}
              {!isReferencesLoading && !isReferencesError && referencesUnavailable ? (
                <p className="text-sm text-muted-foreground">
                  يجب توفير عائلة مواد ووحدة قياس نشطتين قبل إضافة مادة.
                </p>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="materialKind"
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>نوع المادة</FormLabel>
                      <Select
                        value={field.value}
                        disabled={isPending}
                        onValueChange={handleMaterialKindChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Consumable">مستهلكة</SelectItem>
                          <SelectItem value="Asset">أصل ثابت</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={referencesUnavailable} loading={isPending}>
                  {material ? 'حفظ التعديلات' : 'إضافة المادة'}
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
      {confirmElement}
    </>
  )
}
