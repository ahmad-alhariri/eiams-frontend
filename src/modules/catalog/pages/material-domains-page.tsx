import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialDomainFormDialog } from '@/modules/catalog/components/material-domain-form-dialog'
import {
  useCreateMaterialDomainMutation,
  useSetMaterialDomainStatusMutation,
  useUpdateMaterialDomainMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toCreateMaterialDomainRequest,
  toUpdateMaterialDomainRequest,
  type MaterialDomainFormValues,
} from '@/modules/catalog/schemas/material-domain.schemas'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { ListMaterialDomainsQuery } from '@/modules/catalog/types/catalog.api-types'
import type { MaterialDomain, RecordStatus } from '@/modules/catalog/types/catalog.types'

const materialDomainColumnHelper = createColumnHelper<typeof dataTableFeatures, MaterialDomain>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Scoped, contract-backed material domain directory.
 *
 * Pagination is the same `useServerPagination` + `DataTableServer` composition
 * `/catalog/materials` already uses, for the same reason: `GET /catalog/domains`
 * defaults to 20 rows a page and returns no filter but `status`, so a plain
 * `DataTable` over an unparameterised query silently dropped every domain past
 * row 20 — 22 exist, so two were unreachable with no control to reach them.
 * The wire is one-based and so is the hook, so the page crosses unchanged; the
 * service clamps it into `[1, 21474836]` / `[1, 100]`.
 */
function MaterialDomainsPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogDomain, setDialogDomain] = useState<MaterialDomain | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<MaterialDomain | null>(null)
  const domainsQueryInput = useMemo<ListMaterialDomainsQuery>(
    () => ({
      page: currentPage,
      pageSize,
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, pageSize, status],
  )
  const domainsQuery = useMaterialDomainsQuery(domainsQueryInput)
  const createMutation = useCreateMaterialDomainMutation()
  const updateMutation = useUpdateMaterialDomainMutation()
  const statusMutation = useSetMaterialDomainStatusMutation()

  /** A filter change starts a new result set, so it returns to the first page. */
  const handleStatusChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setStatus(isRecordStatus(value) ? value : undefined)
    },
    [setPage],
  )

  const openCreate = useCallback(() => setDialogDomain(null), [])
  const openEdit = useCallback((domain: MaterialDomain) => setDialogDomain(domain), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogDomain(undefined)
  }, [])

  /**
   * Create and update are two different bodies: the create binds `name` and
   * `code`, the update binds `name` alone. A single "upsert" mapper is what
   * used to send `code` (and a status, and a version token) into a route that
   * binds none of them.
   */
  const submitForm = useCallback(
    async (values: MaterialDomainFormValues) => {
      const domain = dialogDomain ?? null
      try {
        if (domain === null) {
          await createMutation.mutateAsync(toCreateMaterialDomainRequest(values))
          toast.success({ title: 'تمت إضافة مجال التصنيف.' })
        } else {
          await updateMutation.mutateAsync({
            domainId: domain.id,
            request: toUpdateMaterialDomainRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات مجال التصنيف.' })
        }
        setDialogDomain(undefined)
      } catch (error: unknown) {
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
        throw error
      }
    },
    [createMutation, dialogDomain, updateMutation],
  )

  /**
   * One command, two directions: `PUT /catalog/domains/{id}/status` takes the
   * enum ORDINAL, which the hook derives from the status the row actually
   * carries. A 409/404 surfaces as an Arabic toast and nothing about the row is
   * assumed to have changed.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({ domainId: statusTarget.id, status: nextStatus })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل المجال مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط المجال من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget])

  const columns = useMemo(
    () =>
      materialDomainColumnHelper.columns([
        materialDomainColumnHelper.accessor('name', {
          id: 'name',
          header: 'اسم المجال',
          cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
        }),
        materialDomainColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: (info) => <span dir="ltr">{info.getValue()}</span>,
        }),
        materialDomainColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              materialDomainColumnHelper.display({
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

  const isStatusTargetActive = statusTarget?.status === 'Active'
  const domainsPage = domainsQuery.data
  const totalCount = domainsPage?.totalItems
  const totalPages = Math.max(domainsPage?.totalPages ?? 1, 1)

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="مجالات التصنيف"
        subtitle="المستوى الأعلى في هيكل تصنيف المواد ضمن نطاق العمل الحالي."
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-52">
              <span className="text-sm font-medium text-foreground">حالة المجال</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة المجال">
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
                إضافة مجال
              </Button>
            ) : null}
          </div>
        }
      />
      <ContentCard
        title="قائمة مجالات التصنيف"
        description="تُدار المجالات عبر خادم النظام، بما في ذلك نطاق الصلاحيات وحالة السجل، وينفّذ الخادم التنقل بين الصفحات والتصفية بالحالة."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(domainsPage, domainsQuery.isError)}
          isLoading={domainsQuery.isLoading}
          isError={domainsQuery.isError}
          onRetry={() => void domainsQuery.refetch()}
          errorTitle="تعذّر تحميل مجالات التصنيف"
          errorMessage="تعذّر جلب قائمة المجالات. حاول مرة أخرى."
          emptyTitle="لا توجد مجالات تصنيف"
          emptyDescription="لم يتم العثور على مجالات تطابق حالة السجل المحددة."
          emptyAction={canManage ? <Button onClick={openCreate}>إضافة مجال</Button> : undefined}
          page={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>
      <MaterialDomainFormDialog
        open={dialogDomain !== undefined}
        domain={dialogDomain ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل مجال تصنيف' : 'تنشيط مجال تصنيف'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم المجال ظاهراً في التصنيفات والسجلات السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم المجال متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل المجال' : 'تنشيط المجال'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default MaterialDomainsPage
