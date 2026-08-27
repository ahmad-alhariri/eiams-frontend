import { IconArrowRight, IconCirclePlus, IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useRolesQuery, useUserRoleScopesQuery } from '@/modules/admin/hooks/use-admin-queries'
import { useReplaceUserRoleScopesMutation } from '@/modules/admin/hooks/use-admin-mutations'
import { ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { formatUuid } from '@/shared/utils/format'
import type { ReplaceRoleScopesRequest, ScopeType } from '@/shared/types/generated/eiams-v1'

type AssignmentDraft = {
  roleId: string
  scopeType: ScopeType
  scopeId: string
}

const SCOPE_TYPES: ReadonlyArray<{ value: ScopeType; label: string }> = [
  { value: 'Enterprise', label: 'المؤسسة' },
  { value: 'Site', label: 'موقع' },
  { value: 'Warehouse', label: 'مستودع' },
]

const EMPTY_ASSIGNMENT: AssignmentDraft = { roleId: '', scopeType: 'Enterprise', scopeId: '' }

function toDraft(roleId: string, scopeType: ScopeType, scopeId: string | null): AssignmentDraft {
  return { roleId, scopeType, scopeId: scopeId ?? '' }
}

/**
 * User role-scope assignments. The v1 contract replaces the entire assignment
 * set per user (PUT), so the editor maintains a local draft and submits the
 * complete list. Effective permissions remain session-owned; this page only
 * edits the server-side role/scope grants for the account.
 */
function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const canManage = has('admin.user.manage')

  const roleScopesQuery = useUserRoleScopesQuery(userId)
  const rolesQuery = useRolesQuery()
  const replaceMutation = useReplaceUserRoleScopesMutation()

  const [assignments, setAssignments] = useState<AssignmentDraft[]>([])

  useEffect(() => {
    if (roleScopesQuery.data === undefined) return
    // Sync the external role-scopes read model into the editable local draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignments(
      roleScopesQuery.data.map((scope) =>
        toDraft(scope.role.roleId, scope.scope.scopeType, scope.scope.scopeId),
      ),
    )
  }, [roleScopesQuery.data])

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])
  const isLoading = roleScopesQuery.isLoading || (canManage && rolesQuery.isLoading)
  const roleName = useMemo(
    () => (roleId: string) => roles.find((role) => role.roleId === roleId)?.nameAr ?? roleId,
    [roles],
  )

  const addAssignment = () => setAssignments((prev) => [...prev, { ...EMPTY_ASSIGNMENT }])
  const removeAssignment = (index: number) =>
    setAssignments((prev) => prev.filter((_, i) => i !== index))
  const updateAssignment = (index: number, patch: Partial<AssignmentDraft>) =>
    setAssignments((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const save = async () => {
    if (userId === undefined) return
    const request: ReplaceRoleScopesRequest = {
      assignments: assignments
        .filter((assignment) => assignment.roleId !== '')
        .map((assignment) => ({
          roleId: assignment.roleId,
          scopeId: assignment.scopeType === 'Enterprise' ? null : assignment.scopeId || null,
          scopeType: assignment.scopeType,
        })),
      rowVersion: 0,
    }
    await replaceMutation.mutateAsync({ userId, request })
    toast.success({ title: 'تم حفظ تعيينات أدوار المستخدم.' })
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
      ) : roleScopesQuery.isError ? (
        <ErrorState
          title="تعذّر تحميل تعيينات المستخدم"
          description="تعذّر جلب أدوار المستخدم من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button type="button" variant="outline" onClick={() => void roleScopesQuery.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6">
          <ContentCard title="بيانات الحساب" description="معرّف حساب المستخدم ضمن نطاق العمل.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="معرّف المستخدم">
                <span dir="ltr">{userId ? formatUuid(userId) : '—'}</span>
              </DetailField>
            </div>
          </ContentCard>

          <ContentCard
            title="أدوار المستخدم ونطاقاتها"
            description="كل تعيين يربط دوراً بنطاق (المؤسسة، أو موقع، أو مستودع). الحفظ يستبدل مجموعة التعيينات بالكامل."
            action={
              canManage ? (
                <Button type="button" onClick={addAssignment}>
                  <IconCirclePlus aria-hidden data-icon="inline-start" />
                  إضافة تعيين
                </Button>
              ) : null
            }
          >
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد أدوار معيّنة لهذا المستخدم ضمن نطاق العمل الحالي.
              </p>
            ) : (
              <ul className="grid gap-3">
                {assignments.map((assignment, index) => (
                  <li
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">الدور</span>
                      <Select
                        value={assignment.roleId}
                        disabled={!canManage || rolesQuery.isLoading}
                        onValueChange={(value) => {
                          if (value !== null) updateAssignment(index, { roleId: value })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الدور" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role.roleId} value={role.roleId}>
                              {role.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">النطاق</span>
                      <Select
                        value={assignment.scopeType}
                        disabled={!canManage}
                        onValueChange={(value) => {
                          if (value !== null)
                            updateAssignment(index, { scopeType: value as ScopeType })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_TYPES.map((scope) => (
                            <SelectItem key={scope.value} value={scope.value}>
                              {scope.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        معرّف النطاق
                      </span>
                      <Input
                        value={assignment.scopeType === 'Enterprise' ? '' : assignment.scopeId}
                        disabled={!canManage || assignment.scopeType === 'Enterprise'}
                        placeholder={assignment.scopeType === 'Enterprise' ? 'غير مطلوب' : 'UUID'}
                        dir="ltr"
                        aria-label={`معرّف نطاق التعيين ${index + 1}`}
                        onChange={(event) =>
                          updateAssignment(index, { scopeId: event.currentTarget.value })
                        }
                      />
                    </div>
                    <div>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`إزالة تعيين ${roleName(assignment.roleId)}`}
                          onClick={() => removeAssignment(index)}
                        >
                          <IconTrash aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={() => void save()}
                  loading={replaceMutation.isPending}
                  disabled={replaceMutation.isPending}
                >
                  <IconDeviceFloppy aria-hidden data-icon="inline-start" />
                  حفظ التعيينات
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                عرض للقراءة فقط؛ لا تملك صلاحية تعديل أدوار المستخدم.
              </p>
            )}
          </ContentCard>
        </div>
      )}
    </div>
  )
}

export default UserDetailPage
