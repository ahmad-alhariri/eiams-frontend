import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { siteSchema, type SiteFormValues } from '@/modules/organization/schemas/site.schemas'
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
import type { Site } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: SiteFormValues = {
  organizationId: '',
  code: '',
  nameAr: '',
  governorate: '',
  address: '',
  status: 'Active',
}

export interface SiteFormDialogProps {
  site: Site | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: SiteFormValues) => Promise<void>
}

/** Creates and updates sites without introducing an uncontracted organization lookup. */
export function SiteFormDialog({
  site,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: SiteFormDialogProps) {
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      organizationId: site?.organizationId ?? '',
      code: site?.code ?? '',
      nameAr: site?.nameAr ?? '',
      governorate: site?.governorate ?? '',
      address: site?.address ?? '',
      status: site?.status ?? 'Active',
    })
  }, [form, open, site])

  const submit = async (values: SiteFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['organizationId', 'code', 'nameAr', 'governorate', 'address', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{site ? 'تعديل الموقع' : 'إضافة موقع'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات الموقع المعتمدة. حقول المحافظة والعنوان اختيارية.
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
              name="organizationId"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>معرّف الجهة المالكة</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending || site?.organizationId !== undefined}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </FormControl>
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
                    <FormLabel>اسم الموقع</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="مثال: المقر الرئيسي" />
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
                    <FormLabel>رمز الموقع</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" disabled={isPending} placeholder="DAM-HQ" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="governorate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المحافظة</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="مثال: دمشق" />
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
                      onValueChange={(value) => field.onChange(value)}
                    >
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
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>العنوان</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="العنوان التفصيلي للموقع"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {site ? 'حفظ التعديلات' : 'إضافة الموقع'}
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
