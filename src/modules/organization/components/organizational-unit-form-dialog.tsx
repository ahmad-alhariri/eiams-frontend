import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  isInvalidOrganizationalUnitParent,
  organizationalUnitSchema,
  type OrganizationalUnitFormValues,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import {
  useOrganizationalUnitsQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
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
import type { OrganizationalUnit } from '@/shared/types/generated/eiams-v1'

const REFERENCE_PAGE = { pageIndex: 0, pageSize: 200 } as const
const ROOT_PARENT_VALUE = '__root__'
const EMPTY_VALUES: OrganizationalUnitFormValues = {
  siteId: '',
  parentOrgUnitId: '',
  code: '',
  nameAr: '',
  status: 'Active',
}

export interface OrganizationalUnitFormDialogProps {
  unit: OrganizationalUnit | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: OrganizationalUnitFormValues) => Promise<void>
}

/**
 * Creates and updates organizational units from the two v1 directory lists.
 * No free-text identifiers or uncontracted hierarchy endpoint is used.
 */
export function OrganizationalUnitFormDialog({
  unit,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: OrganizationalUnitFormDialogProps) {
  const form = useForm<OrganizationalUnitFormValues>({
    resolver: zodResolver(organizationalUnitSchema),
    defaultValues: EMPTY_VALUES,
  })
  const sitesQuery = useSitesQuery(REFERENCE_PAGE, { enabled: open })
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE, { enabled: open })
  const sites = useMemo(() => sitesQuery.data?.items ?? [], [sitesQuery.data])
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data])
  const referencesLoading = sitesQuery.isLoading || unitsQuery.isLoading
  const referencesError = sitesQuery.isError || unitsQuery.isError
  const siteId = useWatch({ control: form.control, name: 'siteId' })
  const parentOptions = useMemo(
    () =>
      units.filter(
        (candidate) => !isInvalidOrganizationalUnitParent(candidate.orgUnitId, siteId, unit, units),
      ),
    [siteId, unit, units],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset({
      siteId: unit?.siteId ?? '',
      parentOrgUnitId: unit?.parentOrgUnitId ?? '',
      code: unit?.code ?? '',
      nameAr: unit?.nameAr ?? '',
      status: unit?.status ?? 'Active',
    })
  }, [form, open, unit])

  const submit = async (values: OrganizationalUnitFormValues) => {
    if (isInvalidOrganizationalUnitParent(values.parentOrgUnitId, values.siteId, unit, units)) {
      form.setError('parentOrgUnitId', {
        type: 'validate',
        message: 'لا يمكن اختيار هذه الوحدة كوحدة أم.',
      })
      return
    }

    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['siteId', 'parentOrgUnitId', 'code', 'nameAr', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{unit ? 'تعديل الوحدة التنظيمية' : 'إضافة وحدة تنظيمية'}</DialogTitle>
          <DialogDescription>
            اختر الموقع والوحدة الأم من الدليل المعتمد. ترك الوحدة الأم فارغة ينشئ وحدة رئيسية.
          </DialogDescription>
        </DialogHeader>
        {referencesError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
          >
            <span>تعذر تحميل بيانات المواقع أو الوحدات. أعد المحاولة قبل الحفظ.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void Promise.all([sitesQuery.refetch(), unitsQuery.refetch()])
              }}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : null}
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending || referencesLoading}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="siteId"
                rules={{ required: true }}
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الموقع</FormLabel>
                    <Select
                      value={field.value === '' ? null : field.value}
                      disabled={isPending || referencesLoading || referencesError}
                      onValueChange={(value) => {
                        const siteId = value ?? ''
                        field.onChange(siteId)
                        const parentOrgUnitId = form.getValues('parentOrgUnitId')
                        if (
                          isInvalidOrganizationalUnitParent(parentOrgUnitId, siteId, unit, units)
                        ) {
                          form.setValue('parentOrgUnitId', '', {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue placeholder="اختر الموقع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.siteId} value={site.siteId}>
                            {site.nameAr} ({site.code})
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
                    <FormLabel>الوحدة الأم</FormLabel>
                    <Select
                      value={field.value === '' ? ROOT_PARENT_VALUE : field.value}
                      disabled={isPending || referencesLoading || referencesError || siteId === ''}
                      onValueChange={(value) =>
                        field.onChange(value === ROOT_PARENT_VALUE ? '' : (value ?? ''))
                      }
                    >
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue placeholder="بدون وحدة أم" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ROOT_PARENT_VALUE}>
                          بدون وحدة أم (وحدة رئيسية)
                        </SelectItem>
                        {parentOptions.map((candidate) => (
                          <SelectItem key={candidate.orgUnitId} value={candidate.orgUnitId}>
                            {candidate.nameAr} ({candidate.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nameAr"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الوحدة التنظيمية</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending || referencesLoading || referencesError}
                        placeholder="مثال: مديرية الشؤون الإدارية"
                      />
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
                    <FormLabel>رمز الوحدة</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        disabled={isPending || referencesLoading || referencesError}
                        placeholder="DAM-ADMIN"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="status"
              rules={{ required: true }}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الحالة</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || referencesLoading || referencesError}
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
              <Button
                type="submit"
                loading={isPending}
                disabled={referencesLoading || referencesError || sites.length === 0}
              >
                {unit ? 'حفظ التعديلات' : 'إضافة الوحدة'}
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
