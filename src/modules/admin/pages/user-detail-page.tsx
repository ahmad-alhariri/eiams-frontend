import { zodResolver } from '@hookform/resolvers/zod'
import { IconArrowRight } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import {
  useAssignmentScopeLabel,
  useAssignmentScopeSelector,
} from '@/modules/admin/hooks/use-assignment-scope-selector'
import {
  UserRoleScopeEditor,
  type RoleOption,
} from '@/modules/admin/components/user-role-scopes-editor'
import { userDisplayName } from '@/modules/admin/types/user.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import {
  useLinkUserToEmployeeMutation,
  useReplaceUserRoleScopeMutation,
  useUnlinkUserFromEmployeeMutation,
} from '@/modules/admin/hooks/use-admin-mutations'
import {
  useEmployeeQuery,
  useEmployeesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import {
  useRolesQuery,
  useUserQuery,
  useUserRoleScopeQuery,
} from '@/modules/admin/hooks/use-admin-queries'
import {
  toReplaceUserRoleScopeRequest,
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
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { formatUuid } from '@/shared/utils/format'

/**
 * The user's sole role-and-scope assignment (D-SRS-01).
 *
 * The form holds the assignment's own `rowVersion` — read from the assignment,
 * not the user summary, because the two counters move independently — and submits
 * it as `expectedRowVersion` so a concurrent reassignment is refused rather than
 * overwritten. A user with no assignment yet submits 0, which is the version the
 * backend expects for that first write.
 */
function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const canManage = has('admin.user.manage')
  const canViewRoleCatalog = has('admin.role.view')
  const canSelectRoles = canManage && canViewRoleCatalog

  const userQuery = useUserQuery(userId)
  const roleScopeQuery = useUserRoleScopeQuery(userId)
  const rolesQuery = useRolesQuery(canSelectRoles)
  const replaceMutation = useReplaceUserRoleScopeMutation()
  const linkMutation = useLinkUserToEmployeeMutation()
  const unlinkMutation = useUnlinkUserFromEmployeeMutation()
  const submitFeedback = useSubmitFeedback()

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false)

  const linkedEmployeeId = userQuery.data?.employeeId ?? null
  const employeeQuery = useEmployeeQuery(linkedEmployeeId ?? undefined)
  // Active employees are the only valid link targets; the server enforces scope and LDR-04.
  const employeesQuery = useEmployeesQuery({ page: 1, pageSize: 100, status: 'Active' })
  const linkableEmployees = useMemo(
    () => (employeesQuery.data?.items ?? []).filter((employee) => employee.status === 'Active'),
    [employeesQuery.data],
  )

  // Rendering-only gate. The backend remains authoritative: it also requires the
  // employee to be Inactive and the account to be Suspended when the write arrives.
  const canOfferUnlink =
    canManage &&
    linkedEmployeeId !== null &&
    userQuery.data?.status === 'Suspended' &&
    employeeQuery.data?.status === 'Inactive'
  const form = useForm<UserRoleScopeFormValues>({
    resolver: zodResolver(userRoleScopeSchema),
    defaultValues: {
      assignment: { roleId: '', scopeType: 'Enterprise', scopeId: '' },
      expectedRowVersion: 0,
    },
  })

  const assignment = roleScopeQuery.data ?? null

  // The picker follows the FORM's scope type, not the served one: the administrator
  // may have switched to Site before choosing a target, and the loader must offer
  // sites for that choice rather than the assignment's previous scope type.
  const formScopeType = useWatch({ control: form.control, name: 'assignment.scopeType' })
  const scopeType = formScopeType ?? assignment?.scopeType ?? 'Enterprise'
  const scopeSelector = useAssignmentScopeSelector(scopeType)
  const scopeLabelAr = useAssignmentScopeLabel(
    assignment?.scopeType ?? 'Enterprise',
    assignment?.scopeId ?? null,
  )

  useEffect(() => {
    if (userQuery.data === undefined || roleScopeQuery.data === undefined) return
    form.reset(toUserRoleScopeFormValues(roleScopeQuery.data))
  }, [form, roleScopeQuery.data, userQuery.data])

  /**
   * The roles catalogue is authoritative, so it supplies every option together with
   * the scope types each role permits.
   *
   * Without `admin.role.view` the catalogue is never read, and the assignment's own
   * `roleName` (the server-resolved role CODE) is all that is available. That is
   * shown verbatim rather than translated: the Arabic label lives only in the
   * catalogue, so rendering anything else here would mean inventing one. An empty
   * `allowedScopeTypes` leaves the scope-type choices unfiltered for that role,
   * which is the backend's decision to enforce anyway.
   */
  const roles = useMemo(() => {
    const byId = new Map<string, RoleOption>()
    for (const role of rolesQuery.data ?? []) {
      byId.set(role.id, {
        id: role.id,
        nameAr: role.nameAr,
        allowedScopeTypes: role.allowedScopeTypes,
      })
    }
    if (assignment !== null && !byId.has(assignment.roleId)) {
      byId.set(assignment.roleId, {
        id: assignment.roleId,
        nameAr: assignment.roleName,
        allowedScopeTypes: [],
      })
    }
    // Only offered as a choice when the catalogue is readable; otherwise the role is
    // rendered as a resolved value, never as a picker over an unverified list.
    return [...byId.values()]
  }, [assignment, rolesQuery.data])

  const isLoading =
    userQuery.isLoading || roleScopeQuery.isLoading || (canSelectRoles && rolesQuery.isLoading)

  const submit = async (values: UserRoleScopeFormValues) => {
    if (userId === undefined) return
    form.clearErrors()
    try {
      await submitFeedback(async () => {
        await replaceMutation.mutateAsync({
          userId,
          request: toReplaceUserRoleScopeRequest(values),
        })
        toast.success({ title: 'تم حفظ دور المستخدم ونطاقه.' })
      })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['assignment', 'expectedRowVersion'],
      })
      const firstFieldError = apiError.fieldErrors[0]
      if (firstFieldError !== undefined) {
        form.setError('assignment', { type: 'server', message: firstFieldError.messageAr })
      }
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
    void employeeQuery.refetch()
  }

  const submitLink = async () => {
    if (userId === undefined || selectedEmployeeId === '') return
    try {
      await submitFeedback(async () => {
        await linkMutation.mutateAsync({
          userId,
          request: { employeeId: selectedEmployeeId },
        })
        toast.success({ title: 'تم ربط الموظف بحساب المستخدم.' })
      })
      setLinkDialogOpen(false)
      setSelectedEmployeeId('')
    } catch {
      // The shared feedback hook already rendered the Arabic error; leave the dialog open.
    }
  }

  const confirmUnlink = async () => {
    if (userId === undefined || linkedEmployeeId === null) return
    try {
      await submitFeedback(async () => {
        await unlinkMutation.mutateAsync({ userId, employeeId: linkedEmployeeId })
        toast.success({ title: 'تم فصل الموظف عن الحساب نهائياً.' })
      })
      setUnlinkDialogOpen(false)
    } catch {
      // A rejected unlink keeps the dialog open and the authoritative state visible.
    }
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
              <DetailField label="الاسم">{userDisplayName(userQuery.data)}</DetailField>
              <DetailField label="البريد الإلكتروني" ltr>
                {userQuery.data.email}
              </DetailField>
              <DetailField label="معرّف المستخدم">
                <span dir="ltr">{formatUuid(userQuery.data.id)}</span>
              </DetailField>
              <DetailField label="الحالة">
                {userQuery.data.status === 'Active' ? 'نشط' : 'موقوف'}
              </DetailField>
              <DetailField label="آخر دخول" ltr>
                {userQuery.data.lastLoginUtc ?? 'لم يسجّل دخولاً بعد'}
              </DetailField>
              <DetailField label="تاريخ الإنشاء" ltr>
                {userQuery.data.createdAtUtc}
              </DetailField>
            </div>
          </ContentCard>

          <ContentCard
            title="ربط الموظف"
            description="الربط عملية لمرة واحدة. الفصل نهائي ولا يمكن إعادة ربط الموظف بعده."
          >
            <div className="flex flex-wrap items-center gap-3">
              <DetailField label="الموظف المرتبط">
                {linkedEmployeeId === null
                  ? 'لا يوجد موظف مرتبط'
                  : (userQuery.data.employeeName ?? formatUuid(linkedEmployeeId))}
              </DetailField>
              {canManage ? (
                linkedEmployeeId === null ? (
                  <Button type="button" onClick={() => setLinkDialogOpen(true)}>
                    ربط موظف
                  </Button>
                ) : canOfferUnlink ? (
                  <Button
                    type="button"
                    variant="destructive"
                    loading={unlinkMutation.isPending}
                    onClick={() => setUnlinkDialogOpen(true)}
                  >
                    فصل الموظف
                  </Button>
                ) : null
              ) : null}
            </div>
          </ContentCard>

          <UserRoleScopeEditor
            canManage={canManage}
            canSelectRoles={canSelectRoles}
            form={form}
            isPending={replaceMutation.isPending}
            isRoleCatalogLoading={rolesQuery.isLoading}
            onSubmit={submit}
            roles={roles}
            loadScopeOptions={scopeSelector.loadOptions}
            scopeSelectorReady={scopeSelector.scopeReady}
            scopeLabelAr={scopeLabelAr}
          />

          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>ربط موظف بالحساب</DialogTitle>
              </DialogHeader>
              <Select
                value={selectedEmployeeId}
                onValueChange={(value) => setSelectedEmployeeId(value ?? '')}
              >
                <SelectTrigger aria-label="اختر الموظف">
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {linkableEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button
                  type="button"
                  loading={linkMutation.isPending}
                  disabled={selectedEmployeeId === ''}
                  onClick={() => void submitLink()}
                >
                  تأكيد الربط
                </Button>
                <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                  إلغاء
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={unlinkDialogOpen}
            onOpenChange={setUnlinkDialogOpen}
            title="فصل الموظف عن الحساب نهائياً"
            message="سيُفصل الموظف عن هذا الحساب ولا يمكن ربطه بأي حساب آخر بعد ذلك. تأكد من تعطيل الموظف وإيقاف الحساب قبل المتابعة."
            confirmLabel="فصل الموظف نهائياً"
            variant="destructive"
            busy={unlinkMutation.isPending}
            onConfirm={() => void confirmUnlink()}
          />
        </div>
      )}
    </div>
  )
}

export default UserDetailPage
