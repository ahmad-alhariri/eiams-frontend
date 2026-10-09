import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useOrganizationsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  siteFormSchema,
  toSiteFormValues,
  type SiteFormValues,
} from '@/modules/organization/schemas/site.schemas'
import type { Site } from '@/modules/organization/types/organization.types'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { normalizeApiError } from '@/shared/services/api-error'
import { ReferenceLimitNote } from '@/shared/feedback/reference-limit-note'
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

/**
 * The organization options are a REFERENCE list, not a directory to page
 * through: the backend caps `pageSize` at 100, so this asks for one full page and
 * the dialog says so when more organizations exist — a silently truncated option
 * list reads as "this organization does not exist".
 */
const REFERENCE_PAGE = { page: 1, pageSize: MAX_WIRE_PAGE_SIZE } as const
const SERVER_ERROR_KEYS = ['organizationId', 'code', 'name', 'location', 'governorateCode'] as const

/** Arabic note shown in place of an editable control on the create-only fields. */
const CREATE_ONLY_NOTE = 'تُحدَّد الجهة المالكة والرمز عند إنشاء الموقع ولا يمكن تعديلهما بعد ذلك.'

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
 * The owning organization is chosen from the real `GET /organizations`
 * directory rather than typed as a GUID — the endpoint exists, and a free-text
 * UUID field produced a 400 model-binding failure on every typo. There is no
 * status control: `PUT /sites/{id}` accepts no status and Site has no
 * activation route in this contract.
 */
export function SiteFormDialog({
  site,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: SiteFormDialogProps) {
  const isCreate = site === null
  const organizationsQuery = useOrganizationsQuery(REFERENCE_PAGE, { enabled: open })
  const organizations = useMemo(
    () => organizationsQuery.data?.items ?? [],
    [organizationsQuery.data],
  )
  const organizationsUnavailable = organizationsQuery.isLoading || organizationsQuery.isError
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
  const [name, code, organizationId] = useWatch({
    control: form.control,
    name: ['name', 'code', 'organizationId'],
  })

  const submit = async (values: SiteFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: [...SERVER_ERROR_KEYS] })
    }
  }

  const isSubmittable =
    name.trim().length >= 2 &&
    (!isCreate || (code.trim() !== '' && organizationId.trim() !== '')) &&
    !organizationsUnavailable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة موقع' : 'تعديل الموقع'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات الموقع المعتمدة. حقل العنوان والمحافظة اختياريان.
          </DialogDescription>
        </DialogHeader>
        {organizationsQuery.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            تعذّر تحميل دليل الجهات. أعد المحاولة قبل الحفظ.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void organizationsQuery.refetch()}
            >
              إعادة تحميل الجهات
            </Button>
          </div>
        ) : null}
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending || organizationsUnavailable}
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
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الجهة المالكة</FormLabel>
                  <Select
                    value={field.value === '' ? null : field.value}
                    disabled={isPending || organizationsUnavailable || !isCreate}
                    onValueChange={(value) => field.onChange(value ?? '')}
                  >
                    <FormControl>
                      <SelectTrigger
                        aria-label="الجهة المالكة"
                        aria-invalid={fieldState.invalid || undefined}
                      >
                        <SelectValue placeholder="اختر الجهة المالكة">
                          {organizations.find((organization) => organization.id === field.value)
                            ?.name ?? (
                            <span dir="ltr" className="font-mono text-sm">
                              {field.value}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {organizations.map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{organization.name}</span>
                            {organization.code === '' ? null : (
                              <>
                                {/* The explicit space keeps the accessible name
                                    of the option from running the two labels
                                    together into one word. */}{' '}
                                <span className="text-muted text-sm">{organization.code}</span>
                              </>
                            )}
                          </div>
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
        {isCreate ? (
          <ReferenceLimitNote
            loadedCount={organizationsQuery.data?.items.length}
            totalCount={organizationsQuery.data?.totalItems}
            hint="جهات إضافية قد لا تظهر في قائمة الاختيار."
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
