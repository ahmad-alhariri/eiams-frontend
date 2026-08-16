import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { EmployeeFormDialog } from '@/modules/organization/components/employee-form-dialog'
import {
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
} from '@/modules/organization/hooks/use-employee-mutations'
import {
  useEmployeesQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import type { ListEmployeesQuery } from '@/modules/organization/types/organization.types'
import {
  toEmployeeRequest,
  type EmployeeFormValues,
} from '@/modules/organization/schemas/employee.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { Employee, RecordStatus } from '@/shared/types/generated/eiams-v1'

const employeeColumnHelper = createColumnHelper<typeof dataTableFeatures, Employee>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Scoped, read-only employee directory. The v1 API owns search, filtering,
 * and pagination; no client-side data copy or employee mutation is introduced
 * here because employee administration belongs to the subsequent flow.
 */
function EmployeesListPage() {
  const navigate = useNavigate()
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [siteId, setSiteId] = useState<string | undefined>()
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogEmployee, setDialogEmployee] = useState<Employee | null | undefined>(undefined)

  const employeesQueryInput = useMemo<ListEmployeesQuery>(
    () => ({
      // Table controls are intentionally 1-based for people; the v1 API is 0-based.
      pageIndex: currentPage - 1,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(siteId === undefined ? {} : { siteId }),
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, pageSize, search, siteId, status],
  )
  const employeesQuery = useEmployeesQuery(employeesQueryInput)
  const sitesQuery = useSitesQuery({ pageIndex: 0, pageSize: 200, status: 'Active' })
  const createMutation = useCreateEmployeeMutation()
  const updateMutation = useUpdateEmployeeMutation()
  const submitFeedback = useSubmitFeedback()

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearch(nextSearch)
    },
    [setPage],
  )

  const handleSiteChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setSiteId(value === null || value === 'all' ? undefined : value)
    },
    [setPage],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setStatus(isRecordStatus(value) ? value : undefined)
    },
    [setPage],
  )

  const openCreate = useCallback(() => setDialogEmployee(null), [])
  const openEdit = useCallback((employee: Employee) => setDialogEmployee(employee), [])
  const openDetail = useCallback(
    (employeeId: string) =>
      navigate(ROUTE_PATHS.organizationEmployeeDetail.replace(':employeeId', employeeId)),
    [navigate],
  )
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogEmployee(undefined)
  }, [])
  const submitForm = useCallback(
    async (values: EmployeeFormValues) => {
      const employee = dialogEmployee ?? null
      await submitFeedback(async () => {
        const request = toEmployeeRequest(values, employee)
        if (employee === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة الموظف.' })
        } else {
          await updateMutation.mutateAsync({ employeeId: employee.employeeId, request })
          toast.success({ title: 'تم حفظ تعديلات الموظف.' })
        }
        setDialogEmployee(undefined)
      })
    },
    [createMutation, dialogEmployee, submitFeedback, updateMutation],
  )

  const columns = useMemo(
    () =>
      employeeColumnHelper.columns([
        employeeColumnHelper.accessor('fullNameAr', {
          id: 'fullNameAr',
          header: 'اسم الموظف',
          cell: (info) => (
            <button
              type="button"
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openDetail(info.row.original.employeeId)}
            >
              {info.getValue()}
            </button>
          ),
        }),
        employeeColumnHelper.accessor('employeeNumber', {
          id: 'employeeNumber',
          header: 'الرقم الوظيفي',
        }),
        employeeColumnHelper.accessor('jobTitleAr', {
          id: 'jobTitleAr',
          header: 'المسمى الوظيفي',
          cell: (info) => info.getValue() ?? '—',
        }),
        employeeColumnHelper.accessor('orgUnit.displayName', {
          id: 'orgUnit',
          header: 'الوحدة التنظيمية',
        }),
        employeeColumnHelper.accessor('site.displayName', { id: 'site', header: 'الموقع' }),
        employeeColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              employeeColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل ${row.original.fullNameAr}`}
                    onClick={() => openEdit(row.original)}
                  >
                    <IconEdit aria-hidden />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, openDetail, openEdit],
  )

  const page = employeesQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الموظفون"
        subtitle="دليل الموظفين ضمن نطاق العمل الحالي، للعرض والبحث فقط."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <div className="flex min-w-44 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الموقع</span>
              <Select value={siteId ?? 'all'} onValueChange={handleSiteChange}>
                <SelectTrigger aria-label="تصفية حسب الموقع">
                  <SelectValue>{siteId === undefined ? 'كل المواقع' : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المواقع</SelectItem>
                  {sitesQuery.data?.items.map((site) => (
                    <SelectItem key={site.siteId} value={site.siteId}>
                      {site.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-36 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">الحالة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة الموظف">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : status === 'Active' ? 'نشط' : 'غير نشط'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="Active">نشط</SelectItem>
                  <SelectItem value="Inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canManage ? (
              <Button type="button" className="self-end" onClick={openCreate}>
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة موظف
              </Button>
            ) : null}
          </div>
        }
      />

      <ContentCard
        title="قائمة الموظفين"
        description="ابحث بالاسم أو الرقم الوظيفي، وصفِّ النتائج حسب الموقع أو الحالة، ثم تنقّل بين صفحات الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, employeesQuery.isError)}
          isLoading={employeesQuery.isLoading}
          isError={employeesQuery.isError}
          onRetry={() => void employeesQuery.refetch()}
          errorTitle="تعذّر تحميل الموظفين"
          errorMessage="تعذّر جلب قائمة الموظفين. حاول مرة أخرى."
          emptyTitle="لا يوجد موظفون"
          emptyDescription="لم يتم العثور على موظفين يطابقون معايير البحث الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث بالاسم أو الرقم الوظيفي..."
        />
      </ContentCard>
      <EmployeeFormDialog
        employee={dialogEmployee ?? null}
        open={dialogEmployee !== undefined}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default EmployeesListPage
