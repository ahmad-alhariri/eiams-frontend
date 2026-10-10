import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  organizationFormSchema,
  toOrganizationFormValues,
  type OrganizationFormValues,
} from '@/modules/organization/schemas/organization.schemas'
import type { Organization } from '@/modules/organization/types/organization.types'
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

const SERVER_ERROR_KEYS = ['code', 'name'] as const

/** Arabic note shown in place of an editable control on the create-only field. */
const CREATE_ONLY_NOTE = 'يُحدَّد رمز الجهة عند إنشائها ولا يمكن تعديله بعد ذلك.'

export interface OrganizationFormDialogProps {
  organization: Organization | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: OrganizationFormValues) => Promise<void>
}

/**
 * Creates and updates organizations.
 *
 * `code` binds only to `POST /organizations`, so on edit it renders disabled
 * and carries the record's own value; `toUpdateOrganizationRequest` drops it.
 * There is no status control: neither write body binds status, and activation /
 * deactivation is the separate `PUT /organizations/{id}/status` command.
 */
export function OrganizationFormDialog({
  organization,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: OrganizationFormDialogProps) {
  const isCreate = organization === null
  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema(isCreate)),
    defaultValues: toOrganizationFormValues(null),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(toOrganizationFormValues(organization))
  }, [form, open, organization])

  // One subscription for both fields the submit gate depends on. `useWatch`
  // rather than `form.watch` keeps this out of the React Compiler's
  // incompatible-library path.
  const [name, code] = useWatch({ control: form.control, name: ['name', 'code'] })

  const submit = async (values: OrganizationFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: [...SERVER_ERROR_KEYS] })
    }
  }

  const isSubmittable = name.trim().length >= 2 && (!isCreate || code.trim() !== '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة جهة' : 'تعديل الجهة'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'أدخل اسم الجهة ورمزها المعتمد. الجهة هي المستوى الأعلى في الهيكل التنظيمي، وتتفرّع عنها المواقع.'
              : 'عدّل اسم الجهة ضمن نطاق العمل الحالي. رمز الجهة غير قابل للتعديل بعد الإنشاء.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            {isCreate ? null : (
              <p
                role="note"
                className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
              >
                {CREATE_ONLY_NOTE}
              </p>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم الجهة</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} placeholder="مثال: الهيئة العامة" />
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
                  <FormLabel>رمز الجهة</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending || !isCreate}
                      placeholder="ORG-001"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending} disabled={!isSubmittable}>
                {isCreate ? 'إضافة الجهة' : 'حفظ التعديلات'}
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
