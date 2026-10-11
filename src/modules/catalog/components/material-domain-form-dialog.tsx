import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  materialDomainSchema,
  type MaterialDomainFormValues,
} from '@/modules/catalog/schemas/material-domain.schemas'
import type { MaterialDomain } from '@/modules/catalog/types/catalog.types'
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

const EMPTY_VALUES: MaterialDomainFormValues = { code: '', name: '' }

export interface MaterialDomainFormDialogProps {
  domain: MaterialDomain | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialDomainFormValues) => Promise<void>
}

/**
 * Create/edit dialog for a material domain.
 *
 * `status` is deliberately NOT a form field: a new domain is Active by
 * definition, and a status change afterwards is its own guarded command
 * (`PUT /catalog/domains/{id}/status`) whose body is an INTEGER ordinal — see
 * the row action on `MaterialDomainsPage`. `code` is create-only, so it is
 * rendered read-only while editing rather than being dropped from a body the
 * update route does not bind.
 */
export function MaterialDomainFormDialog({
  domain,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialDomainFormDialogProps) {
  const isEditing = domain !== null
  const form = useForm<MaterialDomainFormValues>({
    resolver: zodResolver(materialDomainSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      code: domain?.code ?? '',
      name: domain?.name ?? '',
    })
  }, [domain, form, open])

  const submit = async (values: MaterialDomainFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['code', 'name'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{domain ? 'تعديل مجال التصنيف' : 'إضافة مجال تصنيف'}</DialogTitle>
          <DialogDescription>
            تحدد المجالات المستوى الأعلى لتصنيف المواد. يُرسل التعديل اسم المجال فقط؛ رمز المجال
            ثابت بعد الإنشاء، والحالة تُدار من إجراء الصف.
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
              name="name"
              rules={{ required: true }}
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
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending || isEditing}
                      placeholder="IT"
                    />
                  </FormControl>
                  {isEditing ? (
                    <p className="text-sm text-muted-foreground">
                      رمز المجال ثابت ولا يُعدّل بعد الإنشاء.
                    </p>
                  ) : null}
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
