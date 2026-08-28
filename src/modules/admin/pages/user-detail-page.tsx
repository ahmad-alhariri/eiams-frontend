import { zodResolver } from '@hookform/resolvers/zod'
import { IconArrowRight } from '@tabler/icons-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { UserRoleScopesEditor } from '@/modules/admin/components/user-role-scopes-editor'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useReplaceUserRoleScopesMutation } from '@/modules/admin/hooks/use-admin-mutations'
import {
  useRolesQuery,
  useUserQuery,
  useUserRoleScopesQuery,
} from '@/modules/admin/hooks/use-admin-queries'
import {
  toReplaceRoleScopesRequest,
  toUserRoleScopesFormValues,
  userRoleScopesSchema,
  type UserRoleScopesFormValues,
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

/**
 * User role-scope assignments. The v1 contract replaces the entire assignment
 * set per user (PUT). The form preserves the user summary's server-owned row
 * version and validates only the UUID/scope shape authorized by OpenAPI.
 */
function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const canManage = has('admin.user.manage')

  const userQuery = useUserQuery(userId)
  const roleScopesQuery = useUserRoleScopesQuery(userId)
  const rolesQuery = useRolesQuery()
  const replaceMutation = useReplaceUserRoleScopesMutation()
  const submitFeedback = useSubmitFeedback()
  const form = useForm<UserRoleScopesFormValues>({
    resolver: zodResolver(userRoleScopesSchema),
    defaultValues: { assignments: [] },
  })
  useEffect(() => {
    if (userQuery.data === undefined || roleScopesQuery.data === undefined) return
    form.reset(toUserRoleScopesFormValues(userQuery.data, roleScopesQuery.data))
  }, [form, roleScopesQuery.data, userQuery.data])

  const roles = useMemo(() => {
    const roleById = new Map(
      (roleScopesQuery.data ?? []).map((roleScope) => [roleScope.role.roleId, roleScope.role]),
    )
    for (const role of rolesQuery.data ?? []) roleById.set(role.roleId, role)
    return [...roleById.values()]
  }, [roleScopesQuery.data, rolesQuery.data])
  const isLoading =
    userQuery.isLoading || roleScopesQuery.isLoading || (canManage && rolesQuery.isLoading)

  const submit = async (values: UserRoleScopesFormValues) => {
    if (userId === undefined) return
    form.clearErrors()
    try {
      await submitFeedback(async () => {
        await replaceMutation.mutateAsync({
          userId,
          request: toReplaceRoleScopesRequest(values),
        })
        toast.success({ title: 'تم حفظ تعيينات أدوار المستخدم.' })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['assignments', 'rowVersion'],
      })
      const firstFieldError = apiError.fieldErrors[0]
      if (firstFieldError !== undefined) {
        form.setError('assignments', { type: 'server', message: firstFieldError.messageAr })
      }
      form.setError('root.serverError', {
        type: 'server',
        message: apiError.detailAr ?? apiError.titleAr,
      })
    }
  }

  const retryUserData = () => {
    void Promise.all([userQuery.refetch(), roleScopesQuery.refetch(), rolesQuery.refetch()])
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="تفاصيل المستخدم"
        subtitle="إدارة أدوار المستخدم ونطاقاتها ضمن نطاق العمل الحالي."
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
      ) : userQuery.isError || roleScopesQuery.isError || (canManage && rolesQuery.isError) ? (
        <ErrorState
          title="تعذّر تحميل تعيينات المستخدم"
          description="تعذّر جلب المستخدم وأدواره من الخادم. تحقق من الاتصال ثم أعد المحاولة."
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
          />
        </div>
      )}
    </div>
  )
}

export default UserDetailPage
