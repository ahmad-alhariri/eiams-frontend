import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { OrganizationFormDialog } from '@/modules/organization/components/organization-form-dialog'
import {
  useCreateOrganizationMutation,
  useSetOrganizationStatusMutation,
  useUpdateOrganizationMutation,
} from '@/modules/organization/hooks/use-organization-mutations'
import { useOrganizationsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  toCreateOrganizationRequest,
  toUpdateOrganizationRequest,
  type OrganizationFormValues,
} from '@/modules/organization/schemas/organization.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
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
import type { Organization, RecordStatus } from '@/modules/organization/types/organization.types'

const organizationColumnHelper = createColumnHelper<typeof dataTableFeatures, Organization>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Contract-backed, scoped directory of organizations — the enterprise root of
 * the hierarchy every site hangs off.
 *
 * All filtering and pagination stay server-owned, and the filters offered are
 * exactly the ones `GET /organizations` binds: `page`, `pageSize` and `status`.
 * There is deliberately NO search box: the endpoint binds no free-text filter
 * and hard-codes its ordering by name, so a search input here would be a
 * control the server silently ignores.
 */
function OrganizationsListPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogOrganization, setDialogOrganization] = useState<Organization | null | undefined>(
    undefined,
  )
  const [statusTarget, setStatusTarget] = useState<Organization | null>(null)
  const organizationsQueryInput = useMemo(
    () => ({
      // Table controls are one-based and so is the wire, so the page crosses the
      // boundary unchanged. A `- 1` here is what put `page=0` on the wire, and
      // `GET /organizations` answers that with 400 REQUEST_VALIDATION_FAILED.
      page: currentPage,
      pageSize,
      ...(status ? { status } : {}),
    }),
    [currentPage, pageSize, status],
  )
  const organizationsQuery = useOrganizationsQuery(organizationsQueryInput)
  const createMutation = useCreateOrganizationMutation()
  const updateMutation = useUpdateOrganizationMutation()
  const statusMutation = useSetOrganizationStatusMutation()
  const submitFeedback = useSubmitFeedback()

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setStatus(isRecordStatus(value) ? value : undefined)
    },
    [setPage],
  )

  const openCreate = useCallback(() => setDialogOrganization(null), [])
  const openEdit = useCallback(
    (organization: Organization) => setDialogOrganization(organization),
    [],
  )
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogOrganization(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: OrganizationFormValues) => {
      const organization = dialogOrganization ?? null
      await submitFeedback(async () => {
        if (organization === null) {
          // `createOrganization` answers `{ id }`; the list is refetched by the
          // hook.
          await createMutation.mutateAsync(toCreateOrganizationRequest(values))
          toast.success({ title: 'تمت إضافة الجهة.' })
        } else {
          // `updateOrganization` answers with an EMPTY body, and its body binds
          // `name` only — the create-only `code` never leaves the form.
          await updateMutation.mutateAsync({
            organizationId: organization.id,
            request: toUpdateOrganizationRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات الجهة.' })
        }
        setDialogOrganization(undefined)
      })
    },
    [createMutation, dialogOrganization, submitFeedback, updateMutation],
  )

  /**
   * Activation is the SAME route as deactivation with the other ordinal, so the
   * one command serves both directions and the copy is chosen from the status
   * the row actually carries. A 409/404 arrives as an Arabic toast through
   * `submitFeedback`; nothing about the row is assumed to have changed.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({
        organizationId: statusTarget.id,
        status: nextStatus,
      })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الجهة مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الجهة من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget])

  const columns = useMemo(
    () =>
      organizationColumnHelper.columns([
        organizationColumnHelper.accessor('name', {
          id: 'name',
          header: 'اسم الجهة',
          cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
        }),
        organizationColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: (info) => <span dir="ltr">{info.getValue()}</span>,
        }),
        organizationColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              organizationColumnHelper.display({
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
                        aria-label={`تعديل ${row.original.name}`}
                        onClick={() => openEdit(row.original)}
                      >
                        <IconEdit aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${isActive ? 'تعطيل' : 'تنشيط'} ${row.original.name}`}
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
    [canManage, openEdit],
  )

  const page = organizationsQuery.data
  const totalCount = page?.totalItems
  const totalPages = Math.max(page?.totalPages ?? 1, 1)
  const isStatusTargetActive = statusTarget?.status === 'Active'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الجهات"
        subtitle="دليل الجهات المعتمد ضمن نطاق العمل الحالي؛ الجهة هي المستوى الأعلى الذي تتفرّع عنه المواقع."
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-52">
              <span className="text-sm font-medium text-foreground">حالة الجهة</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة الجهة">
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
              <Button type="button" onClick={openCreate}>
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة جهة
              </Button>
            ) : null}
          </div>
        }
      />

      <ContentCard
        title="قائمة الجهات"
        description="صفِّ النتائج حسب الحالة، ثم تنقّل بين صفحات الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, organizationsQuery.isError)}
          isLoading={organizationsQuery.isLoading}
          isError={organizationsQuery.isError}
          onRetry={() => void organizationsQuery.refetch()}
          errorTitle="تعذّر تحميل الجهات"
          errorMessage="تعذّر جلب قائمة الجهات. حاول مرة أخرى."
          emptyTitle="لا توجد جهات"
          emptyDescription="لم يتم العثور على جهات تطابق معايير التصفية الحالية."
          emptyAction={
            canManage ? (
              <Button type="button" onClick={openCreate}>
                إضافة جهة
              </Button>
            ) : undefined
          }
          page={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
      <OrganizationFormDialog
        open={dialogOrganization !== undefined}
        organization={dialogOrganization ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل جهة' : 'تنشيط جهة'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم الجهة ظاهراً في المواقع والسندات السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم الجهة متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الجهة' : 'تنشيط الجهة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default OrganizationsListPage
