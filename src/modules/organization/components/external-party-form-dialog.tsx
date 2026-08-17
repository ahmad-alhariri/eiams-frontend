import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  externalPartySchema,
  type ExternalPartyFormValues,
} from '@/modules/organization/schemas/external-party.schemas'
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
import { Textarea } from '@/shared/ui/textarea'
import type { ExternalParty } from '@/shared/types/generated/eiams-v1'

export interface ExternalPartyFormDialogProps {
  party: ExternalParty | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ExternalPartyFormValues) => Promise<void>
}

export function ExternalPartyFormDialog({
  party,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: ExternalPartyFormDialogProps) {
  const form = useForm<ExternalPartyFormValues>({
    resolver: zodResolver(externalPartySchema),
    defaultValues: { nameAr: '', code: '', contactInfo: '', notes: '' },
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset({
      nameAr: party?.nameAr ?? '',
      code: party?.code ?? '',
      contactInfo: party?.contactInfo ?? '',
      notes: party?.notes ?? '',
    })
  }, [form, open, party])

  const submit = async (values: ExternalPartyFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['nameAr', 'code', 'contactInfo', 'notes'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{party ? 'تعديل الجهة الخارجية' : 'إضافة جهة خارجية'}</DialogTitle>
          <DialogDescription>
            تُدار الجهات الخارجية هنا فقط؛ لا يمكن إنشاؤها من نماذج السندات.
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
                  <FormLabel>اسم الجهة</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} placeholder="أدخل اسم الجهة الخارجية" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الرمز</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="مثال: EXT-001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>معلومات الاتصال</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="هاتف أو بريد إلكتروني" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="ملاحظات داخلية اختيارية"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {party ? 'حفظ التعديلات' : 'إضافة الجهة'}
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
