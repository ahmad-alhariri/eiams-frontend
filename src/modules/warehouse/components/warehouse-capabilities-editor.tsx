import { zodResolver } from '@hookform/resolvers/zod'
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { useReplaceWarehouseCapabilitiesMutation } from '@/modules/warehouse/hooks/use-warehouse-mutations'
import {
  CAPABILITY_OPERATIONS,
  toWarehouseCapabilitiesRequest,
  warehouseCapabilitiesSchema,
  type WarehouseCapabilitiesFormValues,
} from '@/modules/warehouse/schemas/warehouse-capabilities.schemas'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import type { CapabilityOperation, WarehouseCapability } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: WarehouseCapabilitiesFormValues = { capabilities: [] }

const OPERATION_LABELS: Record<CapabilityOperation, string> = {
  Receiving: 'استلام',
  Issue: 'صرف',
  Transfer: 'تحويل',
  Count: 'جرد',
  Return: 'إرجاع',
}

export interface WarehouseCapabilitiesEditorProps {
  warehouseId: string
  capabilities: readonly WarehouseCapability[]
}

/**
 * Replaces the complete domain-operation matrix. Server scope and policy validation
 * remain authoritative; this form only permits active domains and contract enum values.
 */
export function WarehouseCapabilitiesEditor({
  warehouseId,
  capabilities,
}: WarehouseCapabilitiesEditorProps) {
  const [open, setOpen] = useState(false)
  const { confirm, element: confirmElement } = useConfirm()
  const domainsQuery = useMaterialDomainsQuery({ status: 'Active' })
  const replaceMutation = useReplaceWarehouseCapabilitiesMutation()
  const submitFeedback = useSubmitFeedback()
  const form = useForm<WarehouseCapabilitiesFormValues>({
    resolver: zodResolver(warehouseCapabilitiesSchema),
    defaultValues: EMPTY_VALUES,
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'capabilities' })
  const watchedCapabilities = useWatch({ control: form.control, name: 'capabilities' }) ?? []

  useEffect(() => {
    if (!open) return
    form.reset({
      capabilities: capabilities.map((capability) => ({
        domainId: capability.domain.id,
        operations: [...capability.operations],
      })),
    })
  }, [capabilities, form, open])

  const submit = async (values: WarehouseCapabilitiesFormValues) => {
    form.clearErrors()
    const result = await confirm({
      title: 'تأكيد حفظ قدرات المستودع',
      message:
        'سيتم استبدال قائمة المجالات والعمليات المسموح بها لهذا المستودع. تُطبّق صلاحية القدرة عند ترحيل المستندات.',
      confirmLabel: 'حفظ القدرات',
      cancelLabel: 'إلغاء',
    })
    if (!result.confirmed) return

    try {
      await submitFeedback(async () => {
        await replaceMutation.mutateAsync({
          warehouseId,
          request: toWarehouseCapabilitiesRequest(values, capabilities),
        })
        setOpen(false)
        toast.success({ title: 'تم حفظ قدرات المستودع.' })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: ['capabilities'] })
      const firstFieldError = apiError.fieldErrors[0]
      if (firstFieldError !== undefined) {
        form.setError('capabilities', {
          type: 'server',
          message: firstFieldError.messageAr,
        })
      }
    }
  }

  const domains = domainsQuery.data ?? []

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <IconEdit aria-hidden data-icon="inline-start" />
        تعديل القدرات
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل قدرات المستودع</DialogTitle>
            <DialogDescription>
              حدّد مجالات المواد والعمليات المسموح بها. لا تضف مجالاً مكرراً، وتبقى صلاحيات النطاق
              والتحقق الخادمي هي المرجع النهائي.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              aria-busy={replaceMutation.isPending}
              className="grid gap-4"
              onSubmit={form.handleSubmit(submit)}
            >
              {domainsQuery.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  تعذّر تحميل مجالات المواد النشطة. أغلق النافذة ثم حاول مجدداً.
                </p>
              ) : null}
              {fields.map((field, index) => {
                const selectedDomainIds = watchedCapabilities.map(
                  (capability) => capability.domainId,
                )
                const selectedDomainId = watchedCapabilities[index]?.domainId ?? ''
                const selectableDomains = domains.filter(
                  (domain) =>
                    domain.domainId === selectedDomainId ||
                    !selectedDomainIds.includes(domain.domainId),
                )
                const currentDomain = capabilities.find(
                  (capability) => capability.domain.id === selectedDomainId,
                )?.domain

                return (
                  <fieldset
                    key={field.id}
                    className="grid gap-4 rounded-md border border-border p-4"
                  >
                    <legend className="px-1 text-sm font-medium text-foreground">
                      قدرة المجال {index + 1}
                    </legend>
                    <FormField
                      control={form.control}
                      name={`capabilities.${index}.domainId`}
                      render={({ field: domainField, fieldState }) => (
                        <FormItem>
                          <FormLabel>مجال المواد</FormLabel>
                          <Select
                            value={domainField.value}
                            disabled={replaceMutation.isPending || domainsQuery.isPending}
                            onValueChange={domainField.onChange}
                          >
                            <FormControl>
                              <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                                <SelectValue placeholder="اختر مجال المواد">
                                  {currentDomain?.displayName ??
                                    domains.find((domain) => domain.domainId === domainField.value)
                                      ?.nameAr ??
                                    'اختر مجال المواد'}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {currentDomain !== undefined &&
                              !selectableDomains.some(
                                (domain) => domain.domainId === currentDomain.id,
                              ) ? (
                                <SelectItem value={currentDomain.id}>
                                  {currentDomain.displayName}
                                </SelectItem>
                              ) : null}
                              {selectableDomains.map((domain) => (
                                <SelectItem key={domain.domainId} value={domain.domainId}>
                                  {domain.nameAr}
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
                      name={`capabilities.${index}.operations`}
                      render={({ field: operationsField, fieldState }) => (
                        <FormItem>
                          <FormLabel>العمليات المسموح بها</FormLabel>
                          <div
                            className="flex flex-wrap gap-x-5 gap-y-3"
                            aria-invalid={fieldState.invalid || undefined}
                          >
                            {CAPABILITY_OPERATIONS.map((operation) => {
                              const checked = operationsField.value.includes(operation)
                              return (
                                <label key={operation} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={checked}
                                    disabled={replaceMutation.isPending}
                                    onCheckedChange={(nextChecked) => {
                                      const nextOperations = nextChecked
                                        ? [...operationsField.value, operation]
                                        : operationsField.value.filter((item) => item !== operation)
                                      operationsField.onChange(nextOperations)
                                    }}
                                  />
                                  {OPERATION_LABELS[operation]}
                                </label>
                              )
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-self-start text-destructive hover:text-destructive"
                      disabled={replaceMutation.isPending}
                      onClick={() => remove(index)}
                    >
                      <IconTrash aria-hidden data-icon="inline-start" />
                      إزالة المجال
                    </Button>
                  </fieldset>
                )
              })}
              {form.formState.errors.capabilities?.message ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.capabilities.message}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={
                  replaceMutation.isPending ||
                  domainsQuery.isPending ||
                  fields.length >= domains.length
                }
                onClick={() => append({ domainId: '', operations: [] })}
              >
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة مجال
              </Button>
              <DialogFooter>
                <Button
                  type="submit"
                  loading={replaceMutation.isPending}
                  disabled={domainsQuery.isError}
                >
                  حفظ القدرات
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={replaceMutation.isPending}
                  onClick={() => setOpen(false)}
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
