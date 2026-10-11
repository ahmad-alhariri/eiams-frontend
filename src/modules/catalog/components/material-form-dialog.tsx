import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useCallback } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'

import {
  MATERIAL_KIND_OPTIONS,
  TRACKING_TYPE_OPTIONS,
} from '@/modules/catalog/constants/catalog-labels'
import {
  getMaterialTrackingPolicy,
  materialFormSchema,
  type MaterialFormValues,
} from '@/modules/catalog/schemas/material.schemas'
import type { Material, MaterialFamily, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
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
type TrackingType = Material['trackingType']

const EMPTY_VALUES: MaterialFormValues = {
  code: '',
  nameAr: '',
  nameEn: null,
  familyId: '',
  baseUnitId: '',
  materialKind: 'Consumable',
  trackingType: 'Quantity',
  hasExpiry: false,
  attributes: null,
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

function isTrackingType(value: string | null): value is TrackingType {
  return value === 'Quantity' || value === 'Serial'
}

/**
 * Core material form: exactly the members `POST /catalog/materials` binds, plus
 * the version token the `PUT` route reads.
 *
 * `familyId`, `baseUnitId` and `code` are CREATE-only — the update record does
 * not bind them — so they render read-only on an existing material instead of
 * being silently dropped from a body the server would ignore.
 * `requiresAssetNumber` is SERVER-derived: it is shown from
 * `getMaterialTrackingPolicy` so the reader sees what the server will decide,
 * and it never travels in either body. `status` is not a field at all; it is a
 * guarded command whose body is an INTEGER ordinal.
 */
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
  const isEditing = material !== null
  const selectableFamilies = families.filter(
    (family) => family.status === 'Active' || family.id === material?.familyId,
  )
  const selectableUnits = units.filter(
    (unit) => unit.status === 'Active' || unit.id === material?.baseUnitId,
  )
  const referencesUnavailable =
    isReferencesLoading ||
    isReferencesError ||
    selectableFamilies.length === 0 ||
    selectableUnits.length === 0
  const form = useForm<MaterialFormValues>({
    // Cast mirrors the adjustment/issue/transfer pages: `attributes` goes
    // through `z.preprocess`, which splits the schema's input type from its
    // output type, so the resolver is typed by the form's own value shape.
    resolver: zodResolver(materialFormSchema) as Resolver<MaterialFormValues>,
    defaultValues: EMPTY_VALUES,
  })
  const selectedMaterialKind = useWatch({ control: form.control, name: 'materialKind' })
  // The policy is read from the EDITED kind so the hint follows the select: the
  // field is server-derived on write, but the reader should see what the server
  // will decide for the kind currently chosen.
  const trackingPolicy = getMaterialTrackingPolicy(selectedMaterialKind)

  useEffect(() => {
    if (!open) return
    form.reset({
      code: material?.code ?? '',
      nameAr: material?.nameAr ?? '',
      nameEn: material?.nameEn ?? null,
      familyId: material?.familyId ?? '',
      baseUnitId: material?.baseUnitId ?? '',
      materialKind: material?.materialKind ?? 'Consumable',
      trackingType: material?.trackingType ?? 'Quantity',
      hasExpiry: material?.hasExpiry ?? false,
      attributes: material?.attributes ?? null,
    })
  }, [form, material, open])

  /**
   * Changing `materialKind` or `trackingType` is the ONLY edit that bumps
   * `catalogVersion`, and it is what `MATERIALS_CLASSIFICATION_LOCKED` can
   * refuse once the material is in operational use — so the user confirms it
   * here rather than discovering the refusal after saving.
   */
  const confirmClassificationChange = useCallback(async () => {
    return await confirm({
      title: 'تأكيد تغيير تصنيف المادة',
      message:
        'سيُعاد ضبط متطلب رقم الأصل وفق السياسة المعتمدة، ويزيد رقم إصدار الكتالوج. تابع فقط إذا كان التصنيف الجديد صحيحاً.',
      confirmLabel: 'تغيير التصنيف',
      cancelLabel: 'إلغاء',
    })
  }, [confirm])

  const handleMaterialKindChange = useCallback(
    async (nextValue: string | null) => {
      if (!isMaterialKind(nextValue) || nextValue === form.getValues('materialKind')) return

      const result = await confirmClassificationChange()
      if (!result.confirmed) return

      form.setValue('materialKind', nextValue, { shouldDirty: true, shouldValidate: true })
    },
    [confirmClassificationChange, form],
  )

  const handleTrackingTypeChange = useCallback(
    async (nextValue: string | null) => {
      if (!isTrackingType(nextValue) || nextValue === form.getValues('trackingType')) return

      const result = await confirmClassificationChange()
      if (!result.confirmed) return

      form.setValue('trackingType', nextValue, { shouldDirty: true, shouldValidate: true })
    },
    [confirmClassificationChange, form],
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
          'nameEn',
          'familyId',
          'baseUnitId',
          'materialKind',
          'trackingType',
          'hasExpiry',
          'attributes',
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
              المادة، ويُرسل رقم إصدار الكتالوج عند التعديل.
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
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المادة بالإنجليزية (اختياري)</FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ''}
                          dir="ltr"
                          disabled={isPending}
                          maxLength={255}
                          placeholder="Desktop Computer"
                          onChange={(event) => field.onChange(event.currentTarget.value || null)}
                        />
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
                      <FormLabel>رمز المادة</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          dir="ltr"
                          disabled={isPending || isEditing}
                          maxLength={50}
                          placeholder="IT-HW-PC-001"
                        />
                      </FormControl>
                      {isEditing ? (
                        <p className="text-sm text-muted-foreground">
                          رمز المادة ثابت ولا يُعدّل بعد الإنشاء.
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                        disabled={isPending || referencesUnavailable || isEditing}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue>
                              {selectableFamilies.find((family) => family.id === field.value)
                                ?.name ?? 'اختر عائلة المادة'}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectableFamilies.map((family) => (
                            <SelectItem key={family.id} value={family.id}>
                              {family.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isEditing ? (
                        <p className="text-sm text-muted-foreground">
                          عائلة المادة ثابتة ولا تُنقل بعد الإنشاء.
                        </p>
                      ) : null}
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
                        disabled={isPending || referencesUnavailable || isEditing}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue>
                              {selectableUnits.find((unit) => unit.id === field.value)?.name ??
                                'اختر وحدة القياس'}
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
                      {isEditing ? (
                        <p className="text-sm text-muted-foreground">
                          وحدة الأساس ثابتة، وكل تحويلات الوحدات تعود إليها.
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                          {MATERIAL_KIND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                  name="trackingType"
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>طريقة التتبع</FormLabel>
                      <Select
                        value={field.value}
                        disabled={isPending}
                        onValueChange={handleTrackingTypeChange}
                      >
                        <FormControl>
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TRACKING_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                name="hasExpiry"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        disabled={isPending}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    </FormControl>
                    <FormLabel>لها تاريخ صلاحية</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="attributes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>خصائص إضافية (JSON)</FormLabel>
                    <FormControl>
                      <Textarea
                        value={field.value ?? ''}
                        dir="ltr"
                        disabled={isPending}
                        placeholder='{"color":"أسود"}'
                        onChange={(event) => field.onChange(event.currentTarget.value || null)}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      اترك الحقل فارغاً إن لم تكن هناك خصائص، ويُرسل الكائن بصيغة JSON فقط.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <dl className="grid gap-4 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">رقم الأصل</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {trackingPolicy.requiresAssetNumber
                      ? 'مطلوب (يحدده الخادم)'
                      : 'غير مطلوب (يحدده الخادم)'}
                  </dd>
                </div>
                {material === null ? null : (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">إصدار الكتالوج</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground" dir="ltr">
                      {material.catalogVersion}
                    </dd>
                  </div>
                )}
              </dl>
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
