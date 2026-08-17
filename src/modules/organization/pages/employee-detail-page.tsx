import { IconArrowRight, IconEdit } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { EmployeeFormDialog } from '@/modules/organization/components/employee-form-dialog'
import { useUpdateEmployeeMutation } from '@/modules/organization/hooks/use-employee-mutations'
import { useEmployeeQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  toEmployeeRequest,
  type EmployeeFormValues,
} from '@/modules/organization/schemas/employee.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'

/** Contract-backed employee profile; its only v1 relationship is the org unit reference. */
function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const employeeQuery = useEmployeeQuery(employeeId)
  const updateMutation = useUpdateEmployeeMutation()
  const submitFeedback = useSubmitFeedback()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const employee = employeeQuery.data
  const canManage = has('organization.manage')
  const returnToEmployees = useCallback(
    () => navigate(ROUTE_PATHS.organizationEmployees),
    [navigate],
  )

  const submitForm = useCallback(
    async (values: EmployeeFormValues) => {
      if (employee === undefined) return
      await submitFeedback(async () => {
        await updateMutation.mutateAsync({
          employeeId: employee.employeeId,
          request: toEmployeeRequest(values, employee),
        })
        setIsEditDialogOpen(false)
        toast.success({ title: 'تم حفظ تعديلات الموظف.' })
      })
    },
    [employee, submitFeedback, updateMutation],
  )

  if (employeeId === undefined || employeeId === '')
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد الموظف"
          description="رابط الموظف غير مكتمل. ارجع إلى القائمة ثم اختر موظفاً صالحاً."
          action={
            <Button type="button" onClick={returnToEmployees}>
              العودة إلى الموظفين
            </Button>
          }
        />
      </div>
    )

  if (employeeQuery.isPending)
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الموظف" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل الموظف..." />
        </ContentCard>
      </div>
    )

  if (employeeQuery.isError || employee === undefined)
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل الموظف"
          description="تعذّر جلب بيانات الموظف. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void employeeQuery.refetch()}>
                إعادة المحاولة
              </Button>
              <Button type="button" variant="outline" onClick={returnToEmployees}>
                العودة إلى الموظفين
              </Button>
            </div>
          }
        />
      </div>
    )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={employee.fullNameAr}
        subtitle={`الرقم الوظيفي: ${employee.employeeNumber}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button type="button" onClick={() => setIsEditDialogOpen(true)}>
                <IconEdit aria-hidden data-icon="inline-start" />
                تعديل الموظف
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={returnToEmployees}>
              <IconArrowRight aria-hidden data-icon="inline-start" />
              العودة إلى الموظفين
            </Button>
          </div>
        }
      />
      <ContentCard title="بيانات الموظف" description="بيانات مرجعية للقراءة ضمن نطاق العمل الحالي.">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="اسم الموظف">{employee.fullNameAr}</DetailField>
          <DetailField label="الرقم الوظيفي" ltr>
            {employee.employeeNumber}
          </DetailField>
          <DetailField label="المسمى الوظيفي">{employee.jobTitleAr ?? '—'}</DetailField>
          <DetailField label="الحالة">
            <StatusBadge entity="record" status={employee.status} />
          </DetailField>
          <DetailField label="الوحدة التنظيمية">{employee.orgUnit.displayName}</DetailField>
          <DetailField label="الموقع">{employee.site.displayName}</DetailField>
        </dl>
      </ContentCard>
      <EmployeeFormDialog
        employee={employee}
        open={isEditDialogOpen}
        isPending={updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setIsEditDialogOpen(false)
        }}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default EmployeeDetailPage
