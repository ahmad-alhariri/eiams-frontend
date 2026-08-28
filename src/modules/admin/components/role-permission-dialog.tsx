import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { RolePermissionMatrixField } from '@/modules/admin/components/role-permission-matrix-field'
import { useUpdateRoleMutation } from '@/modules/admin/hooks/use-admin-mutations'
import { usePermissionsQuery } from '@/modules/admin/hooks/use-admin-queries'
import {
  applyRolePermissionsServerError,
  rolePermissionsSchema,
  toPermissionMatrixRows,
  toRolePermissionsRequest,
  type RolePermissionsFormValues,
} from '@/modules/admin/schemas/role-permissions.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { Form } from '@/shared/forms/form'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { Button } from '@/shared/ui/button'
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
      applyRolePermissionsServerError(form, error)
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
              <RolePermissionMatrixField
                control={form.control}
                disabled={updateMutation.isPending}
                idPrefix="role-permission-dialog"
                rows={rows}
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
