import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { useUpdateRoleMutation } from '@/modules/admin/hooks/use-admin-mutations'
import { usePermissionsQuery } from '@/modules/admin/hooks/use-admin-queries'
import {
  rolePermissionsSchema,
  toPermissionMatrixRows,
  toRolePermissionsRequest,
  type RolePermissionsFormValues,
} from '@/modules/admin/schemas/role-permissions.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { Form, FormField, FormItem, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { toast } from '@/shared/ui/toast-manager'
import type { Role } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: RolePermissionsFormValues = { permissionCodes: [] }

export interface RolePermissionDialogProps {
  /** Role whose permission assignment is edited; `null` keeps the dialog idle. */
  role: Role | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Role permission assignment matrix. The catalog and the effective permissions
 * of every user remain server-owned; this dialog only replaces the permission
 * list of one role definition through the contract PUT, preserving the role's
 * code, name, status, and row version verbatim.
 */
export function RolePermissionDialog({ role, open, onOpenChange }: RolePermissionDialogProps) {
  const permissionsQuery = usePermissionsQuery()
  const updateMutation = useUpdateRoleMutation()
  const submitFeedback = useSubmitFeedback()
  const form = useForm<RolePermissionsFormValues>({
    resolver: zodResolver(rolePermissionsSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({ permissionCodes: role === null ? [] : [...role.permissionCodes] })
  }, [form, open, role])

  const submit = async (values: RolePermissionsFormValues) => {
    if (role === null) return
    form.clearErrors()
    try {
      await submitFeedback(async () => {
        await updateMutation.mutateAsync({
          roleId: role.roleId,
          request: toRolePermissionsRequest(values, role),
        })
        toast.success({ title: 'تم حفظ صلاحيات الدور.' })
        onOpenChange(false)
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: ['permissionCodes'] })
      const firstFieldError = apiError.fieldErrors[0]
      if (firstFieldError !== undefined) {
        form.setError('permissionCodes', { type: 'server', message: firstFieldError.messageAr })
      }
    }
  }

  const rows = toPermissionMatrixRows(permissionsQuery.data ?? [], role?.permissionCodes ?? [])
  const catalogUnavailable = permissionsQuery.isPending || permissionsQuery.isError
  const isEmptyCatalog = !catalogUnavailable && rows.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل صلاحيات الدور</DialogTitle>
          <DialogDescription>
            {role === null
              ? 'اختر دوراً من القائمة لتعديل صلاحياته.'
              : `${role.nameAr} — يستبدل الحفظ قائمة صلاحيات الدور بالكامل، ويعيد الخادم احتساب الصلاحيات الفعلية لكل مستخدم.`}
          </DialogDescription>
        </DialogHeader>

        {permissionsQuery.isPending ? (
          <LoadingSpinner className="min-h-32" label="جارٍ تحميل كتالوج الصلاحيات..." />
        ) : null}

        {permissionsQuery.isError ? (
          <ErrorState
            title="تعذّر تحميل كتالوج الصلاحيات"
            description="لا يمكن تعديل صلاحيات الدور قبل تحميل الكتالوج المعتمد من الخادم."
            action={<Button onClick={() => void permissionsQuery.refetch()}>إعادة المحاولة</Button>}
          />
        ) : null}

        {isEmptyCatalog ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
          >
            لا توجد صلاحيات متاحة في الكتالوج الحالي.
          </p>
        ) : null}

        {!catalogUnavailable && rows.length > 0 && role !== null ? (
          <Form {...form}>
            <form
              noValidate
              aria-busy={updateMutation.isPending}
              className="grid gap-5"
              onSubmit={form.handleSubmit(submit)}
            >
              <FormField
                control={form.control}
                name="permissionCodes"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <fieldset
                      aria-invalid={fieldState.invalid || undefined}
                      className="overflow-hidden rounded-md border border-border"
                    >
                      <legend className="sr-only">الصلاحيات المسندة إلى الدور</legend>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
                        <span>الصلاحية</span>
                        <span>مُسندة</span>
                      </div>
                      {rows.map((permission) => (
                        <div
                          key={permission.code}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border px-4 py-3 last:border-b-0"
                        >
                          <div className="grid gap-1">
                            <label
                              htmlFor={`role-permission-dialog-${permission.code}`}
                              className="cursor-pointer font-semibold text-foreground"
                            >
                              {permission.nameAr}
                            </label>
                            <code dir="ltr" className="w-fit text-xs text-muted-foreground">
                              {permission.code}
                            </code>
                            {permission.descriptionAr ? (
                              <span className="text-sm text-muted-foreground">
                                {permission.descriptionAr}
                              </span>
                            ) : null}
                          </div>
                          <Checkbox
                            id={`role-permission-dialog-${permission.code}`}
                            checked={field.value.includes(permission.code)}
                            disabled={updateMutation.isPending}
                            onCheckedChange={(nextChecked) => {
                              field.onChange(
                                nextChecked
                                  ? [...field.value, permission.code]
                                  : field.value.filter((code) => code !== permission.code),
                              )
                            }}
                          />
                        </div>
                      ))}
                    </fieldset>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" loading={updateMutation.isPending}>
                  حفظ الصلاحيات
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={() => onOpenChange(false)}
                >
                  إلغاء
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
