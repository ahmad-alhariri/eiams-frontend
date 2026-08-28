import { zodResolver } from '@hookform/resolvers/zod'
import { IconArrowRight, IconDeviceFloppy } from '@tabler/icons-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { RolePermissionMatrixField } from '@/modules/admin/components/role-permission-matrix-field'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useUpdateRoleMutation } from '@/modules/admin/hooks/use-admin-mutations'
import { usePermissionsQuery, useRoleQuery } from '@/modules/admin/hooks/use-admin-queries'
import {
  applyRolePermissionsServerError,
  rolePermissionsSchema,
  toPermissionMatrixRows,
  toRolePermissionsRequest,
  type RolePermissionsFormValues,
} from '@/modules/admin/schemas/role-permissions.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { Form } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'

const EMPTY_VALUES: RolePermissionsFormValues = { permissionCodes: [] }

/**
 * Role permission replacement screen. Effective user permissions remain
 * session-owned; this page only edits the server-side role definition.
 */
function RolePermissionsPage() {
  const { roleId } = useParams<{ roleId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const roleQuery = useRoleQuery(roleId)
  const permissionsQuery = usePermissionsQuery()
  const updateMutation = useUpdateRoleMutation()
  const submitFeedback = useSubmitFeedback()
  const { confirm, element: confirmElement } = useConfirm()
  const form = useForm<RolePermissionsFormValues>({
    resolver: zodResolver(rolePermissionsSchema),
    defaultValues: EMPTY_VALUES,
  })
  const role = roleQuery.data
  const canManage = has('admin.role.manage')
  const returnToRoles = () => navigate(ROUTE_PATHS.adminRoles)

  useEffect(() => {
    if (role === undefined) return
    form.reset({ permissionCodes: [...role.permissionCodes] })
  }, [form, role])

  const submit = async (values: RolePermissionsFormValues) => {
    if (role === undefined) return
    form.clearErrors()
    const result = await confirm({
      title: 'تأكيد حفظ صلاحيات الدور',
      message:
        'سيتم استبدال قائمة صلاحيات هذا الدور بالكامل. يعيد الخادم احتساب الصلاحيات الفعلية حسب نطاق كل مستخدم.',
      confirmLabel: 'حفظ الصلاحيات',
      cancelLabel: 'إلغاء',
    })
    if (!result.confirmed) return

    try {
      await submitFeedback(async () => {
        await updateMutation.mutateAsync({
          roleId: role.roleId,
          request: toRolePermissionsRequest(values, role),
        })
        toast.success({ title: 'تم حفظ صلاحيات الدور.' })
      })
    } catch (error: unknown) {
      applyRolePermissionsServerError(form, error)
    }
  }

  if (roleId === undefined || roleId === '') {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد الدور"
          description="رابط الدور غير مكتمل. ارجع إلى القائمة ثم اختر دوراً صالحاً."
          action={<Button onClick={returnToRoles}>العودة إلى الأدوار</Button>}
        />
      </div>
    )
  }

  if (roleQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الدور" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل الدور..." />
        </ContentCard>
      </div>
    )
  }

  if (roleQuery.isError || role === undefined) {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل الدور"
          description="تعذّر جلب بيانات الدور. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void roleQuery.refetch()}>إعادة المحاولة</Button>
              <Button type="button" variant="outline" onClick={returnToRoles}>
                العودة إلى الأدوار
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const rows = toPermissionMatrixRows(permissionsQuery.data ?? [], role.permissionCodes)

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={role.nameAr}
        subtitle={`رمز الدور: ${role.code}`}
        actions={
          <Button type="button" variant="outline" onClick={returnToRoles}>
            <IconArrowRight aria-hidden data-icon="inline-start" />
            العودة إلى الأدوار
          </Button>
        }
      />

      <ContentCard title="بيانات الدور" description="بيانات مرجعية كما أعادها الخادم.">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <DetailField label="اسم الدور">{role.nameAr}</DetailField>
          <DetailField label="الرمز" ltr>
            {role.code}
          </DetailField>
          <DetailField label="الحالة">
            <StatusBadge entity="record" status={role.status} />
          </DetailField>
        </dl>
      </ContentCard>

      <ContentCard
        title="مصفوفة الصلاحيات"
        description="كتالوج الصلاحيات مصدره الخادم. التعديل يستبدل القائمة كاملة باستخدام إصدار الدور الحالي."
      >
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
        {!permissionsQuery.isPending && !permissionsQuery.isError && rows.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
          >
            لا توجد صلاحيات متاحة في الكتالوج الحالي.
          </p>
        ) : null}
        {!permissionsQuery.isPending &&
        !permissionsQuery.isError &&
        rows.length > 0 &&
        canManage ? (
          <Form {...form}>
            <form
              noValidate
              aria-busy={updateMutation.isPending}
              className="grid gap-4"
              onSubmit={form.handleSubmit(submit)}
            >
              <RolePermissionMatrixField
                control={form.control}
                disabled={updateMutation.isPending}
                idPrefix="role-permission"
                rows={rows}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={updateMutation.isPending}>
                  <IconDeviceFloppy aria-hidden data-icon="inline-start" />
                  حفظ الصلاحيات
                </Button>
              </div>
            </form>
          </Form>
        ) : null}
        {!permissionsQuery.isPending &&
        !permissionsQuery.isError &&
        rows.length > 0 &&
        !canManage ? (
          <dl className="overflow-hidden rounded-md border border-border">
            {rows.map((permission) => (
              <div
                key={permission.code}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="grid gap-1">
                  <dt className="font-semibold text-foreground">{permission.nameAr}</dt>
                  <dd>
                    <code dir="ltr" className="text-xs text-muted-foreground">
                      {permission.code}
                    </code>
                  </dd>
                </div>
                <dd className="text-sm text-muted-foreground">
                  {role.permissionCodes.includes(permission.code) ? 'مُسندة' : 'غير مُسندة'}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </ContentCard>
      {confirmElement}
    </div>
  )
}

export default RolePermissionsPage
