import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useMaterialSelector } from '@/shared/selectors/adapters/material-selector'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import { useUpsertWarehouseMaterialSettingMutation } from '@/modules/warehouse/hooks/use-warehouse-mutations'
import {
  toWarehouseMaterialSettingRequest,
  warehouseMaterialSettingSchema,
  type WarehouseMaterialSettingFormValues,
} from '@/modules/warehouse/schemas/warehouse-material-settings.schemas'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
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
import { toast } from '@/shared/ui/toast-manager'
import type { Material, WarehouseMaterialSetting } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: WarehouseMaterialSettingFormValues = {
  materialId: '',
  minQuantity: '',
  maxQuantity: '',
  status: 'Active',
}

export interface MaterialPickerControlProps {
  value: string
  readOnly: boolean
  disabled: boolean
  setting: WarehouseMaterialSetting | null
  materialLabel: string
  onValueChange: (value: string | null, option: AsyncSelectOption<Material> | undefined) => void
  loadOptions: (query: string) => Promise<AsyncSelectOption<Material>[]>
}

/**
 * The material field control. In edit mode the material is immutable, so a
 * disabled input shows the name instead of a search box (the AsyncSelect
 * would otherwise display the raw material id until an option matches).
 */
function MaterialPickerControl({
  value,
  readOnly,
  disabled,
  setting,
  materialLabel,
  onValueChange,
  loadOptions,
}: MaterialPickerControlProps) {
  const { formItemId, formDescriptionId, formMessageId } = useFormField()
  const describedBy = [formDescriptionId, formMessageId].filter(Boolean).join(' ') || undefined

  if (setting !== null) {
    return (
      <Input
        type="text"
        value={materialLabel}
        disabled
        id={formItemId}
        aria-describedby={describedBy}
      />
    )
  }

  return (
    <AsyncSelect
      value={value}
      readOnly={readOnly}
      disabled={disabled}
      placeholder="اكتب اسم المادة للبحث..."
      inputProps={{ id: formItemId, 'aria-describedby': describedBy }}
      onValueChange={onValueChange}
      loadOptions={loadOptions}
    />
  )
}

export interface WarehouseMaterialSettingsEditorProps {
  warehouseId: string
  /** All current settings; used to keep one row per material and its row version. */
  settings: readonly WarehouseMaterialSetting[]
  /** The row being edited, or null for a new setting. */
  setting: WarehouseMaterialSetting | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Creates or updates one per-warehouse material setting (min/max thresholds).
 * Material choices are searched server-side and limited to active materials
 * not already configured (except the row being edited). The server remains
 * authoritative for scope, duplicate material, and concurrency checks.
 */
export function WarehouseMaterialSettingsEditor({
  warehouseId,
  settings,
  setting,
  open,
  onOpenChange,
}: WarehouseMaterialSettingsEditorProps) {
  const { confirm, element: confirmElement } = useConfirm()
  const upsertMutation = useUpsertWarehouseMaterialSettingMutation()
  const submitFeedback = useSubmitFeedback()
  const form = useForm<WarehouseMaterialSettingFormValues>({
    resolver: zodResolver(warehouseMaterialSettingSchema),
    defaultValues: EMPTY_VALUES,
  })
  const watchedMaterialId = useWatch({ control: form.control, name: 'materialId' })
  const [materialLabel, setMaterialLabel] = useState(setting?.material.displayName ?? '')
  const [previousSetting, setPreviousSetting] = useState(setting)
  // React-documented "adjusting state during render" pattern: keeps the label
  // in sync when the dialog target (setting) changes, without effects.
  if (setting?.settingId !== previousSetting?.settingId) {
    setPreviousSetting(setting)
    setMaterialLabel(setting === null ? '' : setting.material.displayName)
  }

  const materialSelector = useMaterialSelector(async (query) => {
    const configuredIds = new Set(
      settings
        .filter((item) => item.settingId !== setting?.settingId)
        .map((item) => item.material.id),
    )
    const page = await catalogService.listMaterials({
      pageIndex: 0,
      pageSize: 10,
      status: 'Active',
      ...(query.trim() === '' ? {} : { search: query.trim() }),
    })
    return page.items.filter((material) => !configuredIds.has(material.materialId))
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      setting === null
        ? EMPTY_VALUES
        : {
            materialId: setting.material.id,
            minQuantity: setting.minQuantity === null ? '' : String(setting.minQuantity),
            maxQuantity: setting.maxQuantity === null ? '' : String(setting.maxQuantity),
            status: setting.status,
          },
    )
  }, [form, open, setting])

  const submit = async (values: WarehouseMaterialSettingFormValues) => {
    form.clearErrors()
    const result = await confirm({
      title: 'تأكيد حفظ إعداد المادة',
      message:
        'يحدّد هذا الإعداد حدّي الأدنى والأعلى للمادة في المستودع الحالي، ويُستخدم لتنبيهات انخفاض المخزون وحدوده.',
      confirmLabel: 'حفظ الإعداد',
      cancelLabel: 'إلغاء',
    })
    if (!result.confirmed) return

    try {
      await submitFeedback(async () => {
        await upsertMutation.mutateAsync({
          warehouseId,
          request: toWarehouseMaterialSettingRequest(values, setting),
        })
        onOpenChange(false)
        toast.success({
          title: setting === null ? 'تمت إضافة إعداد المادة.' : 'تم حفظ تعديل إعداد المادة.',
        })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['materialId', 'minQuantity', 'maxQuantity', 'status'],
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {setting === null ? 'إضافة إعداد مادة' : 'تعديل إعداد المادة'}
            </DialogTitle>
            <DialogDescription>
              حدّد المادة وحدّي الأدنى والأعلى. تُترك الحقول غير المطلوبة فارغة؛ ويبقى التحقق
              الخادمي والنطاق مرجعًا نهائيًا.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              aria-busy={upsertMutation.isPending}
              className="grid gap-4"
              onSubmit={form.handleSubmit(submit)}
            >
              <FormField
                control={form.control}
                name="materialId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المادة</FormLabel>
                    <MaterialPickerControl
                      value={field.value}
                      readOnly={setting !== null}
                      disabled={upsertMutation.isPending}
                      setting={setting}
                      materialLabel={materialLabel}
                      onValueChange={(value, option) => {
                        field.onChange(value ?? '')
                        setMaterialLabel(option?.label ?? '')
                      }}
                      loadOptions={materialSelector.loadOptions}
                    />
                    {setting !== null ? (
                      <FormDescription
                        title={`إعداد المادة الحالي: ${materialLabel}. لا يمكن تغيير المادة عند التعديل.`}
                      />
                    ) : (
                      <FormDescription title="تُعرض المواد النشطة غير المحددة مسبقًا لهذا المستودع." />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="minQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحد الأدنى</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          dir="ltr"
                          inputMode="decimal"
                          placeholder="مثال: 2"
                          disabled={upsertMutation.isPending}
                          value={field.value}
                          onChange={(event) => field.onChange(event.currentTarget.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحد الأعلى</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          dir="ltr"
                          inputMode="decimal"
                          placeholder="مثال: 10"
                          disabled={upsertMutation.isPending}
                          value={field.value}
                          onChange={(event) => field.onChange(event.currentTarget.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select
                      value={field.value}
                      disabled={upsertMutation.isPending || setting === null}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger
                          aria-label="حالة الإعداد"
                          aria-invalid={fieldState.invalid || undefined}
                        >
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
              <DialogFooter>
                <Button
                  type="submit"
                  loading={upsertMutation.isPending}
                  disabled={watchedMaterialId === '' && setting === null}
                >
                  حفظ الإعداد
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={upsertMutation.isPending}
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
