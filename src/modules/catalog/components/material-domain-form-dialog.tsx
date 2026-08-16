import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  materialDomainSchema,
  type MaterialDomainFormValues,
} from '@/modules/catalog/schemas/material-domain.schemas'
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
import type { MaterialDomain } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: MaterialDomainFormValues = { code: '', nameAr: '', status: 'Active' }

export interface MaterialDomainFormDialogProps {
  domain: MaterialDomain | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialDomainFormValues) => Promise<void>
}

/** Contract-only create/edit dialog; deletion is deliberately absent from the v1 API. */
export function MaterialDomainFormDialog({
  domain,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialDomainFormDialogProps) {
  const form = useForm<MaterialDomainFormValues>({
    resolver: zodResolver(materialDomainSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      code: domain?.code ?? '',
      nameAr: domain?.nameAr ?? '',
      status: domain?.status ?? 'Active',
    })
  }, [domain, form, open])

  const submit = async (values: MaterialDomainFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['code', 'nameAr', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{domain ? 'تعديل مجال التصنيف' : 'إضافة مجال تصنيف'}</DialogTitle>
          <DialogDescription>
            تحدد المجالات المستوى الأعلى لتصنيف المواد. الحقول المطلوبة مطابقة لعقد الإصدار الأول.
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المجال</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} placeholder="مثال: تقنية المعلومات" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رمز المجال</FormLabel>
                  <FormControl>
                    <Input {...field} dir="ltr" disabled={isPending} placeholder="IT" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
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
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {domain ? 'حفظ التعديلات' : 'إضافة المجال'}
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
