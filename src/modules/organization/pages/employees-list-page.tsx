import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { EmployeeFormDialog } from '@/modules/organization/components/employee-form-dialog'
import {
  useCreateEmployeeMutation,
  useSetEmployeeStatusMutation,
  useUpdateEmployeeMutation,
} from '@/modules/organization/hooks/use-employee-mutations'
import {
  useEmployeesQuery,
  useOrganizationalUnitsQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import type { ListEmployeesQuery } from '@/modules/organization/types/organization.types'
import {
  toCreateEmployeeRequest,
  toUpdateEmployeeRequest,
  type EmployeeFormValues,
} from '@/modules/organization/schemas/employee.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ReferenceLimitNote } from '@/shared/feedback/reference-limit-note'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { Employee, RecordStatus } from '@/modules/organization/types/organization.types'

const employeeColumnHelper = createColumnHelper<typeof dataTableFeatures, Employee>()

/**
 * The sites/org-units lookups below are JOINS, not lists: they exist so a flat
 * `orgUnitId` can be shown as a name and so the site filter has names. The
 * backend caps `pageSize` at 100 (`MAX_WIRE_PAGE_SIZE`), so these ask for the
 * maximum one page can hold and the screen admits it with
 * `ReferenceLimitNote` when the directory is longer than that — the unit
 * column would otherwise fall back to `—` past row 100 without saying why.
 */
const REFERENCE_PAGE = { page: 1, pageSize: MAX_WIRE_PAGE_SIZE } as const

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Scoped employee directory.
 *
 * The employee projection carries a FLAT `orgUnitId` and no nested `orgUnit` or
 * `site` reference objects, so this screen joins the organizational-unit name
 * from the org-units list. It deliberately renders NO site column: the API
 * filters employees by `siteId`, but an employee record cannot supply a site
 * name, and the site filter dropdown above already offers the site names the
 * directory knows about. Inventing one here would mean joining org unit → site,
 * which only holds when the unit list is complete — so the column was removed
 * rather than faked.
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
  const [statusTarget, setStatusTarget] = useState<Employee | null>(null)

  const employeesQueryInput = useMemo<ListEmployeesQuery>(
    () => ({
      // One-based controls, one-based wire: the page crosses unchanged. The
      // comment that used to sit here claimed "the v1 API is 0-based"; it is
      // not. `PaginationQueryParameters.Page` is `[Range(1, 21474836)]` with
      // default 1, so subtracting one sent `page=0` and the backend answered
      // 400 REQUEST_VALIDATION_FAILED.
      page: currentPage,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(siteId === undefined ? {} : { siteId }),
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, pageSize, search, siteId, status],
  )
  const employeesQuery = useEmployeesQuery(employeesQueryInput)
  const sitesQuery = useSitesQuery({ ...REFERENCE_PAGE, status: 'Active' })
  const unitsQuery = useOrganizationalUnitsQuery(REFERENCE_PAGE)
  const createMutation = useCreateEmployeeMutation()
  const updateMutation = useUpdateEmployeeMutation()
  const statusMutation = useSetEmployeeStatusMutation()
  const submitFeedback = useSubmitFeedback()

  // `orgUnitId` is flat on the wire; the label is joined from the units list.
  const orgUnitNameById = useMemo(
    () => new Map((unitsQuery.data?.items ?? []).map((unit) => [unit.id, unit.name])),
    [unitsQuery.data],
  )

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

  /**
   * Activation is the SAME route as deactivation with the other ordinal, so the
   * one command serves both directions and the copy is chosen from the status the
   * row actually carries. There is no delete in this module: suspending an
   * employee record is the only removal mechanism it has, and reactivating is
   * the way back.
   *
   * `submitFeedback` is what turns a rejected write into one Arabic toast — the
   * confirm dialog stays open, because nothing about the row is known to have
   * changed.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await submitFeedback(async () => {
        await statusMutation.mutateAsync({
          employeeId: statusTarget.id,
          status: nextStatus,
        })
      })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الموظف مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الموظف من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget, submitFeedback])

  const submitForm = useCallback(
    async (values: EmployeeFormValues) => {
      const employee = dialogEmployee ?? null
      await submitFeedback(async () => {
        if (employee === null) {
          // `createEmployee` answers `{ id }`.
          await createMutation.mutateAsync(toCreateEmployeeRequest(values))
          toast.success({ title: 'تمت إضافة الموظف.' })
        } else {
          // `updateEmployee` answers with an EMPTY body.
          await updateMutation.mutateAsync({
            employeeId: employee.id,
            request: toUpdateEmployeeRequest(values),
          })
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
        employeeColumnHelper.accessor('fullName', {
          id: 'fullName',
          header: 'اسم الموظف',
          cell: (info) => (
            <button
              type="button"
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openDetail(info.row.original.id)}
            >
              {info.getValue()}
            </button>
          ),
        }),
        employeeColumnHelper.accessor('employeeNumber', {
          id: 'employeeNumber',
          header: 'الرقم الوظيفي',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        employeeColumnHelper.accessor('jobTitle', {
          id: 'jobTitle',
          header: 'المسمى الوظيفي',
          cell: (info) => info.getValue() ?? '—',
        }),
        employeeColumnHelper.accessor(
          (employee) => orgUnitNameById.get(employee.orgUnitId) ?? '—',
          { id: 'orgUnit', header: 'الوحدة التنظيمية' },
        ),
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
                cell: ({ row }) => {
                  const isActive = row.original.status === 'Active'
                  return (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`تعديل ${row.original.fullName}`}
                        onClick={() => openEdit(row.original)}
                      >
                        <IconEdit aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${isActive ? 'تعطيل' : 'تنشيط'} ${row.original.fullName}`}
                        onClick={() => setStatusTarget(row.original)}
                      >
                        {isActive ? <IconUserOff aria-hidden /> : <IconCheck aria-hidden />}
                      </Button>
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, openDetail, openEdit, orgUnitNameById],
  )

  const page = employeesQuery.data
  const isStatusTargetActive = statusTarget?.status === 'Active'

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
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
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
        description="ابحث بالاسم أو الرقم الوظيفي، وصفِّ النتائج حسب الموقع أو الحالة، ثم تنقّل بين صفحات الخادم."
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
          totalCount={page?.totalItems}
          totalPages={Math.max(page?.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث بالاسم أو الرقم الوظيفي..."
        />
        <ReferenceLimitNote
          loadedCount={unitsQuery.data?.items.length}
          totalCount={unitsQuery.data?.totalItems}
          hint="وحدات إضافية قد لا تظهر في عمود الوحدة التنظيمية."
        />
      </ContentCard>
      <EmployeeFormDialog
        employee={dialogEmployee ?? null}
        open={dialogEmployee !== undefined}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل موظف' : 'تنشيط موظف'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم الموظف ظاهراً في السندات والعهد السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم الموظف متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الموظف' : 'تنشيط الموظف'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default EmployeesListPage
