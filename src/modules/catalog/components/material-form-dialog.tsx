import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  applyMaterialTrackingPolicy,
  getMaterialTrackingPolicy,
  materialSchema,
  type MaterialFormValues,
} from '@/modules/catalog/schemas/material.schemas'
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
import type {
  Material,
  MaterialFamily,
  MaterialKind,
  UnitOfMeasure,
} from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: MaterialFormValues = {
  baseUnitId: '',
  code: '',
  descriptionAr: '',
  familyId: '',
  materialKind: 'Consumable',
  nameAr: '',
  requiresAssetNumber: false,
  status: 'Active',
  trackingType: 'Quantity',
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
  return value === 'Consumable' || value === 'Durable' || value === 'Asset'
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
    (family) => family.status === 'Active' || family.familyId === material?.family.id,
  )
  const selectableUnits = units.filter(
    (unit) => unit.status === 'Active' || unit.unitId === material?.baseUnit.id,
  )
  const referencesUnavailable =
    isReferencesLoading ||
    isReferencesError ||
    selectableFamilies.length === 0 ||
    selectableUnits.length === 0
  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    const materialKind = material?.materialKind ?? 'Consumable'
    const tracking = applyMaterialTrackingPolicy(materialKind, material?.trackingType)
    form.reset({
      baseUnitId: material?.baseUnit.id ?? '',
      code: material?.code ?? '',
      descriptionAr: material?.descriptionAr ?? '',
      familyId: material?.family.id ?? '',
      materialKind,
      nameAr: material?.nameAr ?? '',
      requiresAssetNumber: tracking.requiresAssetNumber,
      status: material?.status ?? 'Active',
      trackingType: tracking.trackingType,
    })
  }, [form, material, open])

  const materialKind = useWatch({ control: form.control, name: 'materialKind' }) ?? 'Consumable'
  const trackingPolicy = getMaterialTrackingPolicy(materialKind)

  const handleMaterialKindChange = useCallback(
    async (nextValue: string | null) => {
      if (!isMaterialKind(nextValue) || nextValue === form.getValues('materialKind')) return

      const result = await confirm({
        title: 'تأكيد تغيير نوع المادة',
        message:
          'سيُعاد ضبط أسلوب التتبع ومتطلب رقم الأصل وفق السياسة المعتمدة. تابع فقط إذا كان التصنيف الجديد صحيحاً.',
        confirmLabel: 'تغيير النوع',
        cancelLabel: 'إلغاء',
      })
      if (!result.confirmed) return

      const tracking = applyMaterialTrackingPolicy(nextValue)
      form.setValue('materialKind', nextValue, { shouldDirty: true, shouldValidate: true })
      form.setValue('trackingType', tracking.trackingType, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue('requiresAssetNumber', tracking.requiresAssetNumber, {
        shouldDirty: true,
        shouldValidate: true,
      })
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
          'baseUnitId',
          'code',
          'descriptionAr',
          'familyId',
          'materialKind',
          'nameAr',
          'requiresAssetNumber',
          'status',
          'trackingType',
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
              أدخل بيانات المادة الأساسية. يطبق النموذج تلقائياً سياسة التتبع المعتمدة حسب نوع
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
                        {...field}
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
                  name="familyId"
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
                              {selectableFamilies.find((family) => family.familyId === field.value)
                                ?.nameAr ?? 'اختر عائلة المادة'}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectableFamilies.map((family) => (
                            <SelectItem key={family.familyId} value={family.familyId}>
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
                  name="baseUnitId"
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
                          <SelectItem value="Durable">عهدة تشغيلية</SelectItem>
                          <SelectItem value="Asset">أصل ثابت</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="trackingType"
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>أسلوب التتبع</FormLabel>
                      <Select
                        value={field.value}
                        disabled={isPending || materialKind !== 'Durable'}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {trackingPolicy.availableTrackingTypes.map((trackingOption) => (
                            <SelectItem key={trackingOption} value={trackingOption}>
                              {trackingOption === 'Quantity' ? 'بالكمية' : 'بالرقم التسلسلي'}
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
                name="requiresAssetNumber"
                render={({ fieldState }) => (
                  <FormItem className="rounded-md border border-input p-3">
                    <FormLabel>رقم الأصل</FormLabel>
                    <p className="mt-1 text-sm text-foreground">
                      {trackingPolicy.requiresAssetNumber ? 'مطلوب' : 'غير مطلوب'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trackingPolicy.requiresAssetNumber
                        ? 'الأصل الثابت يتطلب رقم أصل داخلياً، ويُتبع بالرقم التسلسلي.'
                        : materialKind === 'Durable'
                          ? 'العهدة التشغيلية لا تتطلب رقم أصل، ويمكن تتبعها بالكمية أو بالرقم التسلسلي.'
                          : 'المادة المستهلكة تُتبع بالكمية ولا تتطلب رقم أصل.'}
                    </p>
                    {fieldState.invalid ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
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
