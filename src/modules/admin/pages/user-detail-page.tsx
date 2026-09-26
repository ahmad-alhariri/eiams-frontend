import { zodResolver } from '@hookform/resolvers/zod'
import { IconArrowRight } from '@tabler/icons-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { UserRoleScopesEditor } from '@/modules/admin/components/user-role-scopes-editor'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useReplaceUserRoleScopeMutation } from '@/modules/admin/hooks/use-admin-mutations'
import {
  useRolesQuery,
  useUserQuery,
  useUserRoleScopeQuery,
} from '@/modules/admin/hooks/use-admin-queries'
import {
  toReplaceRoleScopeRequest,
  toUserRoleScopeFormValues,
  userRoleScopeSchema,
  type UserRoleScopeFormValues,
} from '@/modules/admin/schemas/user-role-scopes.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'
import { formatUuid } from '@/shared/utils/format'

const ROLE_SCOPE_SCHEMA_KEYS = ['roleId', 'scopeType', 'scopeId'] as const

/**
 * User role-scope assignment. The v1 contract replaces the user's single
 * assignment per request (PUT role-scope, D-SRS-01): exactly one role and one
 * scope, with no row version. The form validates only the singular shape.
 */
function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const canManage = has('users:manage')
  const canViewRoleCatalog = has('roles:view')
  const canSelectRoles = canManage && canViewRoleCatalog

  const userQuery = useUserQuery(userId)
  const roleScopeQuery = useUserRoleScopeQuery(userId)
  const rolesQuery = useRolesQuery(canSelectRoles)
  const replaceMutation = useReplaceUserRoleScopeMutation()
  const submitFeedback = useSubmitFeedback()
  const form = useForm<UserRoleScopeFormValues>({
    resolver: zodResolver(userRoleScopeSchema),
    defaultValues: { roleId: '', scopeType: 'Enterprise', scopeId: null },
  })
  useEffect(() => {
    if (roleScopeQuery.data === undefined) return
    form.reset(toUserRoleScopeFormValues(roleScopeQuery.data))
  }, [form, roleScopeQuery.data])

  const roles = useMemo(() => {
    const catalog = (rolesQuery.data ?? []).map((role) => ({
      roleId: role.roleId,
      nameAr: role.nameAr,
    }))
    const current = roleScopeQuery.data?.role
    if (current !== undefined && !catalog.some((role) => role.roleId === current.roleId)) {
      catalog.unshift(current)
    }
    return catalog
  }, [roleScopeQuery.data, rolesQuery.data])
  const isLoading =
    userQuery.isLoading || roleScopeQuery.isLoading || (canSelectRoles && rolesQuery.isLoading)

  const submit = async (values: UserRoleScopeFormValues) => {
    if (userId === undefined) return
    form.clearErrors()
    try {
      await submitFeedback(async () => {
        await replaceMutation.mutateAsync({
          userId,
          request: toReplaceRoleScopeRequest(values),
        })
        toast.success({ title: 'تم حفظ تعيين دور المستخدم.' })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: [...ROLE_SCOPE_SCHEMA_KEYS],
      })
      form.setError('root.serverError', {
        type: 'server',
        message: apiError.detailAr ?? apiError.titleAr,
      })
    }
  }

  const retryUserData = () => {
    void userQuery.refetch()
    void roleScopeQuery.refetch()
    if (canSelectRoles) void rolesQuery.refetch()
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="تفاصيل المستخدم"
        subtitle="إدارة دور المستخدم ونطاقه ضمن نطاق العمل الحالي."
        toolbar={
          <Button type="button" variant="outline" onClick={() => navigate(ROUTE_PATHS.adminUsers)}>
            <IconArrowRight aria-hidden data-icon="inline-start" />
            العودة إلى المستخدمين
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : userQuery.isError || roleScopeQuery.isError || (canSelectRoles && rolesQuery.isError) ? (
        <ErrorState
          title="تعذّر تحميل تعيين المستخدم"
          description="تعذّر جلب المستخدم ودوره من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button type="button" variant="outline" onClick={retryUserData}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : userQuery.data === undefined ? (
        <ErrorState
          title="تعذّر تحميل تفاصيل المستخدم"
          description="لا تتوفر بيانات حساب المستخدم المحدد."
        />
      ) : (
        <div className="grid gap-6">
          <ContentCard title="بيانات الحساب" description="بيانات الحساب كما أعادها الخادم.">
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailField label="اسم المستخدم">{userQuery.data.displayName}</DetailField>
              <DetailField label="اسم الدخول" ltr>
                {userQuery.data.username}
              </DetailField>
              <DetailField label="معرّف المستخدم">
                <span dir="ltr">{formatUuid(userQuery.data.userId)}</span>
              </DetailField>
            </div>
          </ContentCard>

          <UserRoleScopesEditor
            canManage={canManage}
            form={form}
            isPending={replaceMutation.isPending}
            isRoleCatalogLoading={rolesQuery.isLoading}
            onSubmit={submit}
            roles={roles}
            canSelectRoles={canSelectRoles}
          />
        </div>
      )}
    </div>
  )
}

export default UserDetailPage
