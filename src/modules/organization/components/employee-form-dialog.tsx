import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import { useOrganizationalUnitsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  employeeSchema,
  type EmployeeFormValues,
} from '@/modules/organization/schemas/employee.schemas'
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
import type { Employee } from '@/shared/types/generated/eiams-v1'

const REFERENCE_PAGE = { pageIndex: 0, pageSize: 200, status: 'Active' } as const
const EMPTY_VALUES: EmployeeFormValues = {
  employeeNumber: '',
  fullNameAr: '',
  jobTitleAr: '',
  orgUnitId: '',
  status: 'Active',
}

export interface EmployeeFormDialogProps {
  employee: Employee | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: EmployeeFormValues) => Promise<void>
}

/** Employee upsert form backed only by the scoped organizational-unit directory. */
export function EmployeeFormDialog({
  employee,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: EmployeeFormDialogProps) {
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: EMPTY_VALUES,
  })
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE, { enabled: open })
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data])

  useEffect(() => {
    if (!open) return
    form.reset({
      employeeNumber: employee?.employeeNumber ?? '',
      fullNameAr: employee?.fullNameAr ?? '',
      jobTitleAr: employee?.jobTitleAr ?? '',
      orgUnitId: employee?.orgUnit.id ?? '',
      status: employee?.status ?? 'Active',
    })
  }, [employee, form, open])

  const submit = async (values: EmployeeFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['employeeNumber', 'fullNameAr', 'jobTitleAr', 'orgUnitId', 'status'],
      })
    }
  }

  const referencesUnavailable = unitsQuery.isLoading || unitsQuery.isError
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{employee ? 'تعديل الموظف' : 'إضافة موظف'}</DialogTitle>
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
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fullNameAr"
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
                        disabled={isPending || referencesUnavailable}
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
              name="jobTitleAr"
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
                    disabled={isPending || referencesUnavailable}
                    onValueChange={(value) => field.onChange(value ?? '')}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue placeholder="اختر الوحدة التنظيمية" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.orgUnitId} value={unit.orgUnitId}>
                          {unit.nameAr} ({unit.code})
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
              <Button
                type="submit"
                loading={isPending}
                disabled={referencesUnavailable || units.length === 0}
              >
                {employee ? 'حفظ التعديلات' : 'إضافة الموظف'}
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
