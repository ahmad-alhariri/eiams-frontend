import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { useReplaceWarehouseCapabilitiesMutation } from '@/modules/warehouse/hooks/use-warehouse-mutations'
import {
  CAPABILITY_OPERATIONS,
  toWarehouseCapabilitiesRequest,
  warehouseCapabilitiesSchema,
  type WarehouseCapabilitiesFormValues,
} from '@/modules/warehouse/schemas/warehouse-capabilities.schemas'
import { Form, FormControl, FormField } from '@/shared/forms/form'
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
import type { WarehouseCapability } from '@/modules/warehouse/types/warehouse.api-types'

const EMPTY_VALUES: WarehouseCapabilitiesFormValues = { capabilities: [] }

export interface WarehouseCapabilitiesEditorProps {
  warehouseId: string
  capabilities: readonly WarehouseCapability[]
}

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
  const { fields, remove } = useFieldArray({ control: form.control, name: 'capabilities' })
  const watchedCapabilities = useWatch({ control: form.control, name: 'capabilities' }) ?? []

  const selectedDomainIds = useMemo(
    () => new Set(watchedCapabilities.map((c) => c.domainId)),
    [watchedCapabilities],
  )

  const domainOptions = useMemo(
    () =>
      domainsQuery.data?.items
        .filter((domain) => !selectedDomainIds.has(domain.materialDomainId))
        .map((domain) => ({ value: domain.materialDomainId, label: domain.nameAr })),
    [domainsQuery.data?.items, selectedDomainIds],
  )

  const domainOps = useMemo(
    () => new Map(capabilities.map((cap) => [cap.domainId, cap.operations] as const)),
    [capabilities],
  )

  const watchedDomains = useMemo(
    () => new Set(watchedCapabilities.map((c) => c.domainId)),
    [watchedCapabilities],
  )

  void watchedDomains

  const currentOpsFor = (domainId: string) => domainOps.get(domainId) ?? []

  useEffect(() => {
    if (!open) return
    form.reset({
      capabilities: capabilities.map((cap) => ({
        domainId: cap.domainId,
        operations: [...cap.operations],
      })),
    })
  }, [capabilities, form, open])

  const submit = async (values: WarehouseCapabilitiesFormValues) => {
    form.clearErrors()
    const result = await confirm({
      title: 'تأكيد حفظ القدرات',
      message:
        'تؤدي هذه العملية إلى استبدال كامل مصفوفة عمليات المستودع المرتبطة بالمجالات المختارة. يُرجى التأكد من دقة الاختيارات قبل الحفظ.',
      confirmLabel: 'حفظ التغييرات',
      cancelLabel: 'إلغاء',
    })
    if (!result.confirmed) return

    try {
      await submitFeedback(async () => {
        await replaceMutation.mutateAsync({
          warehouseId,
          request: toWarehouseCapabilitiesRequest(values, capabilities, warehouseId),
        })
        toast.success({ title: 'تم حفظ قدرات المستودع.' })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['capabilities'],
      })
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        إدارة القدرات
      </Button>

      {capabilities.length > 0 ? (
        <div className="mt-3 grid gap-2 rounded-lg border bg-card p-3">
          {capabilities.map((cap) => (
            <div key={cap.domainId} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{cap.domain.displayName}</span>
                <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                  {cap.operations.map((op) => (
                    <span
                      key={op}
                      className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]"
                    >
                      {op}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">لم تُعرّف أي قدرات لهذا المستودع بعد.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>إدارة قدرات المستودع</DialogTitle>
            <DialogDescription>
              اختر المجالات وفعّل العمليات المسموح بها. تُطبق التغييرات على كامل مصفوفة القدرات.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              aria-busy={replaceMutation.isPending}
              className="grid gap-4"
              onSubmit={form.handleSubmit(submit)}
            >
              <FormField
                control={form.control}
                name="capabilities"
                render={() => (
                  <div className="grid gap-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-3">
                        <FormControl>
                          <Select
                            value={field.domainId}
                            onValueChange={(value) => {
                              form.setValue(`capabilities.${index}.domainId`, value ?? '')
                            }}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="اختر المجال" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">اختر المجال</SelectItem>
                              {domainOptions?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>

                        <div className="flex gap-2 flex-wrap">
                          {CAPABILITY_OPERATIONS.map((op) => {
                            const currentOps = currentOpsFor(field.domainId)
                            const enabled = currentOps.includes(op)
                            return (
                              <Checkbox
                                key={op}
                                checked={enabled}
                                onCheckedChange={(checked) => {
                                  const next = checked
                                    ? [...currentOps, op]
                                    : currentOps.filter((o) => o !== op)
                                  form.setValue(`capabilities.${index}.operations`, next)
                                }}
                              >
                                {op}
                              </Checkbox>
                            )
                          })}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(index)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}

                    {domainOptions?.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        جميع المجالات المفعّلة مُدرَجة حاليًا.
                      </p>
                    )}
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="capabilities"
                render={() => (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {watchedCapabilities.length > 0 ? (
                      <>
                        {watchedCapabilities.map((cap) => (
                          <span key={cap.domainId} className="rounded bg-muted px-2 py-1 text-xs">
                            {cap.domainId} — {cap.operations.join(', ')}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="italic">لا توجد قدرات محددة</span>
                    )}
                  </div>
                )}
              />

              <DialogFooter>
                <Button
                  type="submit"
                  loading={replaceMutation.isPending}
                  disabled={watchedCapabilities.length === 0}
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
