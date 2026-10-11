import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  useOrganizationalUnitsQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import {
  emptyOrganizationalUnitFormValues,
  isInvalidOrganizationalUnitParent,
  organizationalUnitFormSchema,
  toOrganizationalUnitFormValues,
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

const REFERENCE_PAGE = { page: 0, pageSize: 200 } as const
const SERVER_ERROR_KEYS = ['siteId', 'parentId', 'name', 'unitType'] as const

/** Arabic note shown in place of an editable control on the create-only fields. */
const CREATE_ONLY_NOTE = 'يُحدَّد الموقع والوحدة الأب عند إنشاء الوحدة ولا يمكن تعديلهما بعد ذلك.'

function organizationalUnitLabel(unit: OrganizationalUnit): string {
  return `${unit.unitType} — ${unit.name}`
}

/**
 * Candidate parents for a unit.
 *
 * A parent must belong to the SAME site as the unit, and must not be the unit
 * itself or one of its descendants. Both checks are pure consequences of the
 * `id`/`parentId` graph, and the cycle check is the one that was previously
 * inert: it compared `undefined` identifiers and therefore excluded nothing.
 */
function parentOptions(
  unit: OrganizationalUnit | null,
  rows: ReadonlyArray<OrganizationalUnit>,
  siteId: string,
): Array<{ value: string; label: string }> {
  const sameSite = rows.filter((candidate) => siteId === '' || candidate.siteId === siteId)

  return [
    { value: '', label: 'بدون وحدة أب' },
    ...sameSite
      .filter((candidate) => !isInvalidOrganizationalUnitParent(unit, candidate, rows))
      .map((candidate) => ({ value: candidate.id, label: organizationalUnitLabel(candidate) })),
  ]
}

export interface OrganizationalUnitFormDialogProps {
  unit: OrganizationalUnit | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: OrganizationalUnitFormValues) => Promise<void>
}

/**
 * Creates and updates organizational units.
 *
 * `siteId` and `parentId` bind only to `POST /organizational-units`, so on edit
 * they render disabled and carry the record's own values;
 * `toUpdateOrganizationalUnitRequest` drops them. Re-siting and re-parenting are
 * not exposed by this contract. `unitType` is free text because the backend
 * types it as a plain string. There is no status control and no code field:
 * neither write body binds them and the projection serves no code.
 */
export function OrganizationalUnitFormDialog({
  unit: organizationalUnit,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: OrganizationalUnitFormDialogProps) {
  const isCreate = organizationalUnit === null
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE, { enabled: open })
  const siteQuery = useSitesQuery(REFERENCE_PAGE, { enabled: open })
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data])
  const sites = useMemo(() => siteQuery.data?.items ?? [], [siteQuery.data])
  const form = useForm<OrganizationalUnitFormValues>({
    resolver: zodResolver(organizationalUnitFormSchema(isCreate)),
    defaultValues: emptyOrganizationalUnitFormValues(),
  })

  const [siteId, name, unitType] = useWatch({
    control: form.control,
    name: ['siteId', 'name', 'unitType'],
  })

  useEffect(() => {
    if (!open) return
    form.reset(toOrganizationalUnitFormValues(organizationalUnit))
  }, [organizationalUnit, form, open])

  const submit = async (values: OrganizationalUnitFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error as Parameters<typeof normalizeApiError>[0])
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: [...SERVER_ERROR_KEYS] })
    }
  }

  const parentOptionsList = useMemo(
    () => parentOptions(organizationalUnit, units, siteId ?? ''),
    [organizationalUnit, siteId, units],
  )

  const siteOptions = useMemo(
    () => sites.map((site) => ({ value: site.id, label: `${site.code} — ${site.name}` })),
    [sites],
  )

  const referencesUnavailable =
    unitsQuery.isLoading || unitsQuery.isError || siteQuery.isLoading || siteQuery.isError

  const isSubmittable =
    name.trim() !== '' &&
    unitType.trim() !== '' &&
    (!isCreate || siteId !== '') &&
    !referencesUnavailable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة وحدة تنظيمية' : 'تعديل الوحدة التنظيمية'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'أدخل بيانات الوحدة التنظيمية الجديدة ضمن نطاق العمل الحالي.'
              : 'عدّل اسم الوحدة ونوعها ضمن نطاق العمل الحالي. الموقع والوحدة الأب غير قابلين للتعديل بعد الإنشاء.'}
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

        {isCreate ? null : (
          <p
            role="note"
            className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
          >
            {CREATE_ONLY_NOTE}
          </p>
        )}

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
                name="name"
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
                name="unitType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع الوحدة التنظيمية</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending || referencesUnavailable}
                        placeholder="مثال: Department"
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
                      disabled={isPending || referencesUnavailable || !isCreate}
                      onValueChange={(value) => field.onChange(value ?? '')}
                    >
                      <FormControl>
                        <SelectTrigger
                          aria-label="الموقع"
                          aria-invalid={fieldState.invalid || undefined}
                        >
                          <SelectValue placeholder="اختر الموقع">
                            {sites.find((site) => site.id === field.value)?.name ?? undefined}
                          </SelectValue>
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
                name="parentId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الوحدة الأب</FormLabel>
                    <Select
                      value={field.value === '' ? null : field.value}
                      disabled={isPending || referencesUnavailable || !isCreate}
                      onValueChange={(value) => field.onChange(value ?? '')}
                    >
                      <FormControl>
                        <SelectTrigger
                          aria-label="الوحدة الأب"
                          aria-invalid={fieldState.invalid || undefined}
                        >
                          <SelectValue placeholder="اختر الوحدة الأب">
                            {units.find((unit) => unit.id === field.value)?.name ?? undefined}
                          </SelectValue>
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

            <DialogFooter>
              <Button type="submit" loading={isPending} disabled={!isSubmittable}>
                {isCreate ? 'إضافة الوحدة' : 'حفظ التعديلات'}
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
