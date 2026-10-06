import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  siteFormSchema,
  toSiteFormValues,
  type SiteFormValues,
} from '@/modules/organization/schemas/site.schemas'
import type { Site } from '@/modules/organization/types/organization.types'
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

const SERVER_ERROR_KEYS = ['organizationId', 'code', 'name', 'location', 'governorateCode'] as const

/** Arabic note shown in place of an editable control on the create-only fields. */
const CREATE_ONLY_NOTE = 'يُحدَّد معرّف الجهة والرمز عند إنشاء الموقع ولا يمكن تعديلهما بعد ذلك.'

export interface SiteFormDialogProps {
  site: Site | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: SiteFormValues) => Promise<void>
}

/**
 * Creates and updates sites.
 *
 * `organizationId` and `code` bind only to `POST /sites`, so on edit they render
 * disabled and carry the record's own values; `toUpdateSiteRequest` drops them.
 * There is no status control: `PUT /sites/{id}` accepts no status and Site has
 * no activation route in this contract.
 */
export function SiteFormDialog({
  site,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: SiteFormDialogProps) {
  const isCreate = site === null
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema(isCreate)),
    defaultValues: toSiteFormValues(null),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(toSiteFormValues(site))
  }, [form, open, site])

  // One subscription for both fields the submit gate depends on. `useWatch`
  // rather than `form.watch` keeps this out of the React Compiler's
  // incompatible-library path.
  const [name, code] = useWatch({ control: form.control, name: ['name', 'code'] })

  const submit = async (values: SiteFormValues) => {
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
          <DialogTitle>{isCreate ? 'إضافة موقع' : 'تعديل الموقع'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات الموقع المعتمدة. حقل العنوان والمحافظة اختياريان.
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
              name="organizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>معرّف الجهة المالكة</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending || !isCreate}
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
                name="name"
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رمز الموقع</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        disabled={isPending || !isCreate}
                        placeholder="DAM-HQ"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="governorateCode"
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
            </div>
            <FormField
              control={form.control}
              name="location"
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
              <Button type="submit" loading={isPending} disabled={!isSubmittable}>
                {isCreate ? 'إضافة الموقع' : 'حفظ التعديلات'}
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
