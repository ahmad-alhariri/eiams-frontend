import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  useOrganizationalUnitsQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import {
  organizationalUnitSchema,
  type OrganizationalUnitFormValues,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import type { OrganizationalUnit } from '@/modules/organization/types/organization.types'
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

const REFERENCE_PAGE = { page: 1, pageSize: 200 } as const

function organizationalUnitLabel(row: { code: string; nameAr: string }): string {
  return `${row.code ?? '—'} — ${row.nameAr}`
}

function parentOptions(
  rows: ReadonlyArray<OrganizationalUnit>,
  selectedId: string,
): Array<{ value: string; label: string }> {
  return [
    { value: '', label: 'بدون وحدة أب' },
    ...rows
      .filter((candidate) => candidate.orgUnitId !== selectedId)
      .map((candidate) => ({
        value: candidate.orgUnitId,
        label: organizationalUnitLabel(candidate),
      })),
  ]
}

const EMPTY_VALUES: OrganizationalUnitFormValues = {
  displayName: '',
  code: '',
  status: 'Active' as const,
  siteId: '',
  parentOrgUnitId: '',
  rowVersion: 0,
}

export interface OrganizationalUnitFormDialogProps {
  unit: OrganizationalUnit | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: OrganizationalUnitFormValues) => Promise<void>
}

export function OrganizationalUnitFormDialog({
  unit: organizationalUnit,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: OrganizationalUnitFormDialogProps) {
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE, { enabled: open })
  const siteQuery = useSitesQuery({ page: 1, pageSize: 100 }, { enabled: open })
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data])
  const sites = useMemo(() => siteQuery.data?.items ?? [], [siteQuery.data])
  const form = useForm<OrganizationalUnitFormValues>({
    resolver: zodResolver(organizationalUnitSchema),
    defaultValues: EMPTY_VALUES,
  })

  const parentOrgUnitId = useWatch({ control: form.control, name: 'parentOrgUnitId' })

  useEffect(() => {
    if (!open) return
    form.reset({
      displayName: organizationalUnit?.nameAr ?? '',
      code: organizationalUnit?.code ?? '',
      status: organizationalUnit?.status ?? 'Active',
      siteId: organizationalUnit?.siteId ?? '',
      parentOrgUnitId: organizationalUnit?.parentOrgUnitId ?? '',
      rowVersion: organizationalUnit?.rowVersion ?? 0,
    })
  }, [organizationalUnit, form, open])

  const submit = async (values: OrganizationalUnitFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error as Parameters<typeof normalizeApiError>[0])
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['displayName', 'code', 'status', 'siteId', 'parentOrgUnitId'],
      })
    }
  }

  const parentOptionsList = useMemo(
    () => parentOptions(units, parentOrgUnitId ?? ''),
    [units, parentOrgUnitId],
  )

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.siteId,
        label: `${site.code} — ${site.nameAr}`,
      })),
    [sites],
  )

  const referencesUnavailable =
    unitsQuery.isLoading || unitsQuery.isError || siteQuery.isLoading || siteQuery.isError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {organizationalUnit ? 'تعديل الوحدة التنظيمية' : 'إضافة وحدة تنظيمية'}
          </DialogTitle>
          <DialogDescription>
            أدخل بيانات الوحدة التنظيمية الجديدة ضمن نطاق العمل الحالي.
          </DialogDescription>
        </DialogHeader>

        {unitsQuery.isError || siteQuery.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            تعذّر تحميل المراجع التنظيمية. أعد المحاولة قبل الحفظ.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void unitsQuery.refetch()}
            >
              إعادة تحميل المراجع
            </Button>
          </div>
        ) : null}

        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending || referencesUnavailable}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الوحدة التنظيمية</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending || referencesUnavailable}
                        placeholder="مثال: إدارة الموارد البشرية"
                      />
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
                    <FormLabel>الرمز</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending || referencesUnavailable}
                        placeholder="مثال: HR"
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
                name="siteId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الموقع</FormLabel>
                    <Select
                      value={field.value === '' ? null : field.value}
                      disabled={isPending || referencesUnavailable}
                      onValueChange={(value) => field.onChange(value ?? '')}
                    >
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue placeholder="اختر الموقع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {siteOptions.map((site) => (
                          <SelectItem key={site.value} value={site.value}>
                            {site.label}
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
                name="parentOrgUnitId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الوحدة الأب</FormLabel>
                    <Select
                      value={field.value === '' ? null : field.value}
                      disabled={isPending || referencesUnavailable}
                      onValueChange={(value) => field.onChange(value ?? '')}
                    >
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue placeholder="اختر الوحدة الأب" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {parentOptionsList.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الحالة</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || referencesUnavailable}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue />
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
              <Button type="submit" loading={isPending} disabled={referencesUnavailable}>
                {organizationalUnit ? 'حفظ التعديلات' : 'إضافة الوحدة'}
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
