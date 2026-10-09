import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useOrganizationalUnitsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  emptyEmployeeFormValues,
  employeeFormSchema,
  toEmployeeFormValues,
  type EmployeeFormValues,
} from '@/modules/organization/schemas/employee.schemas'
import type { Employee } from '@/modules/organization/types/organization.types'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
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

/**
 * The unit options are a REFERENCE list, not a directory to page through: the
 * backend caps `pageSize` at 100, so this asks for one full page and the dialog
 * says so when more units exist — a silently truncated option list reads as
 * "this unit does not exist".
 */
const REFERENCE_PAGE = { page: 1, pageSize: MAX_WIRE_PAGE_SIZE, status: 'Active' } as const
const SERVER_ERROR_KEYS = ['orgUnitId', 'employeeNumber', 'fullName', 'jobTitle'] as const

/** Arabic note shown in place of an editable control on the create-only fields. */
const CREATE_ONLY_NOTE =
  'يُحدَّد الرقم الوظيفي والوحدة التنظيمية عند إنشاء الموظف ولا يمكن تعديلهما بعد ذلك.'

export interface EmployeeFormDialogProps {
  employee: Employee | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: EmployeeFormValues) => Promise<void>
}

/**
 * Creates and updates employees from the scoped organizational-unit directory.
 *
 * `orgUnitId` and `employeeNumber` bind only to `POST /employees`, so on edit
 * they render disabled and carry the record's own values; `toUpdateEmployeeRequest`
 * drops them. Re-assigning an employee to another unit is therefore not offered.
 */
export function EmployeeFormDialog({
  employee,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: EmployeeFormDialogProps) {
  const isCreate = employee === null
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema(isCreate)),
    defaultValues: emptyEmployeeFormValues(),
  })
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE, { enabled: open })
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data])

  useEffect(() => {
    if (!open) return
    form.reset(toEmployeeFormValues(employee))
  }, [employee, form, open])

  const [orgUnitId, fullName] = useWatch({
    control: form.control,
    name: ['orgUnitId', 'fullName'],
  })

  const submit = async (values: EmployeeFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: [...SERVER_ERROR_KEYS] })
    }
  }

  const referencesUnavailable = unitsQuery.isLoading || unitsQuery.isError
  const isSubmittable =
    fullName.trim() !== '' &&
    (!isCreate || (units.length > 0 && orgUnitId !== '')) &&
    !referencesUnavailable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة موظف' : 'تعديل الموظف'}</DialogTitle>
          <DialogDescription>
            اختر الوحدة التنظيمية من الدليل المعتمد ضمن نطاق العمل الحالي.
          </DialogDescription>
        </DialogHeader>
        {unitsQuery.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            تعذّر تحميل الوحدات التنظيمية. أعد المحاولة قبل الحفظ.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void unitsQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : null}
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending || unitsQuery.isLoading}
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
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الموظف</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending || referencesUnavailable}
                        placeholder="مثال: أحمد محمد"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employeeNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الرقم الوظيفي</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        disabled={isPending || referencesUnavailable || !isCreate}
                        placeholder="EMP-001"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="jobTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>المسمى الوظيفي</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isPending || referencesUnavailable}
                      placeholder="مثال: أمين مستودع"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="orgUnitId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الوحدة التنظيمية</FormLabel>
                  <Select
                    value={field.value === '' ? null : field.value}
                    disabled={isPending || referencesUnavailable || !isCreate}
                    onValueChange={(value) => field.onChange(value ?? '')}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue placeholder="اختر الوحدة التنظيمية">
                          {units.find((unit) => unit.id === field.value)?.name ?? undefined}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{unit.name}</span>
                            {unit.unitType === '' ? null : (
                              <span className="text-muted text-sm">{unit.unitType}</span>
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
            <DialogFooter>
              <Button type="submit" loading={isPending} disabled={!isSubmittable}>
                {isCreate ? 'إضافة الموظف' : 'حفظ التعديلات'}
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
