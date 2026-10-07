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
import { Form, FormControl, FormField, FormItem, useFormField } from '@/shared/forms/form'
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

type WatchedCapability = WarehouseCapabilitiesFormValues['capabilities'][number]

const NO_CAPABILITIES: readonly WatchedCapability[] = []

/**
 * The Arabic reason a rejected capability replacement carries.
 *
 * `FormMessage` renders a `<p aria-live="polite">`, which is the right channel for
 * a message attached to one control; a whole-request rejection is announced
 * assertively instead, so assistive technology interrupts rather than waits for a
 * pause in typing.
 */
function CapabilitiesSubmitError() {
  const message = useFormField().error?.message
  if (message === undefined || message === '') {
    return null
  }
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  )
}

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
  const watched = useWatch({ control: form.control, name: 'capabilities' })
  // One stable empty array rather than a fresh `?? []` per render: a new
  // identity on every render invalidates every memo keyed on this value.
  const watchedCapabilities = watched ?? NO_CAPABILITIES

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
                        <FormItem className="flex-1">
                          <Select
                            value={field.domainId}
                            onValueChange={(value) => {
                              form.setValue(`capabilities.${index}.domainId`, value ?? '')
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="اختر المجال" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">اختر المجال</SelectItem>
                              {domainOptions?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>

                        <div className="flex gap-2 flex-wrap">
                          {CAPABILITY_OPERATIONS.map((op) => {
                            const currentOps = currentOpsFor(field.domainId)
                            const enabled = currentOps.includes(op)
                            const checkboxId = `capability-${field.id}-${op}`
                            return (
                              <div key={op} className="flex items-center gap-2">
                                <Checkbox
                                  id={checkboxId}
                                  checked={enabled}
                                  onCheckedChange={(checked) => {
                                    const next = checked
                                      ? [...currentOps, op]
                                      : currentOps.filter((o) => o !== op)
                                    form.setValue(`capabilities.${index}.operations`, next)
                                  }}
                                />
                                <label htmlFor={checkboxId} className="cursor-pointer text-sm">
                                  {op}
                                </label>
                              </div>
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
                  <FormItem>
                    {/* A rejected PUT lands its Arabic reason here: `submit` calls
                        setFormServerErrors with `schemaKeys: ['capabilities']`, and the
                        replacement is rejected as a whole — no single field owns it — so
                        it is surfaced as one assertive alert region, the same shape
                        lifecycle-action-bar.tsx and document-detail-page.tsx use for a
                        form-level rejection. */}
                    <CapabilitiesSubmitError />
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
                  </FormItem>
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
