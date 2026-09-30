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
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'

const EMPTY_VALUES: WarehouseFormValues = {
  siteId: '',
  code: '',
  nameAr: '',
  locationAr: '',
  status: 'Active',
}

export interface WarehouseFormDialogProps {
  warehouse: Warehouse | null | undefined
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: WarehouseFormValues) => Promise<void>
}

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
  const sitesQuery = useSitesQuery({ page: 0, pageSize: 200, status: 'Active' }, { enabled: open })

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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الموقع</FormLabel>
                  <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="الموقع">
                        <SelectValue>
                          {sitesQuery.data?.items.find((s) => s.siteId === field.value)?.nameAr ??
                            field.value ??
                            'اختر الموقع'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">اختر الموقع</SelectItem>
                      {sitesQuery.data?.items.map((site) => (
                        <SelectItem key={site.siteId} value={site.siteId}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{site.nameAr}</span>
                            {site.code ? (
                              <span className="text-muted text-sm">({site.code})</span>
                            ) : null}
                          </div>
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الرمز</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value}
                      disabled={isPending}
                      onValueChange={field.onChange}
                      placeholder="مثال: WH-001"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم (العربية)</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value}
                      disabled={isPending}
                      onValueChange={field.onChange}
                      placeholder="اسم المستودع"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locationAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الموقع التفصيلي (اختياري)</FormLabel>
                  <FormControl>
                    <Textarea
                      value={field.value ?? ''}
                      disabled={isPending}
                      onChange={(event) => field.onChange(event.target.value)}
                      placeholder="وصف موقع المستودع داخل المبنى"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الحالة</FormLabel>
                  <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="حالة المستودع">
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
                loading={isPending}
                disabled={
                  !form.getValues().siteId || !form.getValues().code || !form.getValues().nameAr
                }
              >
                {warehouse ? 'حفظ التعديلات' : 'إضافة المستودع'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
