import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { useSitesQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  warehouseSchema,
  type WarehouseFormValues,
} from '@/modules/warehouse/schemas/warehouse.schemas'
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
import { Textarea } from '@/shared/ui/textarea'
import type { Warehouse } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: WarehouseFormValues = {
  siteId: '',
  code: '',
  nameAr: '',
  locationAr: '',
  status: 'Active',
}

export interface WarehouseFormDialogProps {
  warehouse: Warehouse | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: WarehouseFormValues) => Promise<void>
}

/** Creates and updates only the v1 warehouse identity fields. */
export function WarehouseFormDialog({
  warehouse,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: WarehouseFormDialogProps) {
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: EMPTY_VALUES,
  })
  const sitesQuery = useSitesQuery(
    { pageIndex: 0, pageSize: 200, status: 'Active' },
    { enabled: open },
  )

  useEffect(() => {
    if (!open) return

    form.reset({
      siteId: warehouse?.site.id ?? '',
      code: warehouse?.code ?? '',
      nameAr: warehouse?.nameAr ?? '',
      locationAr: warehouse?.locationAr ?? '',
      status: warehouse?.status ?? 'Active',
    })
  }, [form, open, warehouse])

  const submit = async (values: WarehouseFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['siteId', 'code', 'nameAr', 'locationAr', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{warehouse ? 'تعديل المستودع' : 'إضافة مستودع'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات المستودع المرجعية. إعدادات الصلاحيات والمواد تُدار في صفحات مستقلة.
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
              name="siteId"
              rules={{ required: true }}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الموقع</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || sitesQuery.isPending}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger
                        aria-invalid={fieldState.invalid || undefined}
                        aria-label="الموقع"
                      >
                        <SelectValue placeholder="اختر الموقع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouse !== null &&
                      !sitesQuery.data?.items.some((site) => site.siteId === warehouse.site.id) ? (
                        <SelectItem value={warehouse.site.id}>
                          {warehouse.site.displayName}
                        </SelectItem>
                      ) : null}
                      {sitesQuery.data?.items.map((site) => (
                        <SelectItem key={site.siteId} value={site.siteId}>
                          {site.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nameAr"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم المستودع</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="مثال: المستودع المركزي" />
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
                    <FormLabel>رمز المستودع</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" disabled={isPending} placeholder="WH-CENTRAL" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="locationAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الموقع التفصيلي</FormLabel>
                    <FormControl>
                      <Textarea {...field} disabled={isPending} placeholder="مثال: دمشق" />
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
                    <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
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
            </div>
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {warehouse ? 'حفظ التعديلات' : 'إضافة المستودع'}
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
