import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { SiteFormDialog } from '@/modules/organization/components/site-form-dialog'
import {
  useCreateSiteMutation,
  useSetSiteStatusMutation,
  useUpdateSiteMutation,
} from '@/modules/organization/hooks/use-site-mutations'
import { useSitesQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  toCreateSiteRequest,
  toUpdateSiteRequest,
  type SiteFormValues,
} from '@/modules/organization/schemas/site.schemas'
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
import type { RecordStatus, Site } from '@/modules/organization/types/organization.types'

const siteColumnHelper = createColumnHelper<typeof dataTableFeatures, Site>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Contract-backed, scoped directory of sites. All filtering and pagination
 * stay server-owned; this screen has no local copy of organization data.
 */
function SitesListPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogSite, setDialogSite] = useState<Site | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<Site | null>(null)
  const sitesQueryInput = useMemo(
    () => ({
      // Table controls are one-based and so is the wire, so the page crosses the
      // boundary unchanged. The `- 1` that used to sit here was not a
      // conversion: it put `page=0` on the wire for the first page of the list,
      // which `GET /sites` answers with 400 REQUEST_VALIDATION_FAILED.
      page: currentPage,
      pageSize,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
    }),
    [currentPage, pageSize, search, status],
  )
  const sitesQuery = useSitesQuery(sitesQueryInput)
  const createMutation = useCreateSiteMutation()
  const updateMutation = useUpdateSiteMutation()
  const statusMutation = useSetSiteStatusMutation()
  const submitFeedback = useSubmitFeedback()

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearch(nextSearch)
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

  const openCreate = useCallback(() => setDialogSite(null), [])
  const openEdit = useCallback((site: Site) => setDialogSite(site), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogSite(undefined)
  }, [])

  /**
   * Activation is the SAME route as deactivation with the other ordinal, so the
   * one command serves both directions and the copy is chosen from the status the
   * row actually carries. There is no delete in this module: suspending a site is
   * the only removal mechanism it has, and reactivating is the way back.
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
          siteId: statusTarget.id,
          status: nextStatus,
        })
      })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الموقع مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الموقع من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget, submitFeedback])

  const submitForm = useCallback(
    async (values: SiteFormValues) => {
      const site = dialogSite ?? null
      await submitFeedback(async () => {
        if (site === null) {
          // `createSite` answers `{ id }`; the list is refetched by the hook.
          await createMutation.mutateAsync(toCreateSiteRequest(values))
          toast.success({ title: 'تمت إضافة الموقع.' })
        } else {
          // `updateSite` answers with an EMPTY body.
          await updateMutation.mutateAsync({
            siteId: site.id,
            request: toUpdateSiteRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات الموقع.' })
        }
        setDialogSite(undefined)
      })
    },
    [createMutation, dialogSite, submitFeedback, updateMutation],
  )

  const columns = useMemo(
    () =>
      siteColumnHelper.columns([
        siteColumnHelper.accessor('name', {
          id: 'name',
          header: 'اسم الموقع',
          cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
        }),
        siteColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: (info) => <span dir="ltr">{info.getValue()}</span>,
        }),
        siteColumnHelper.accessor('governorateCode', {
          id: 'governorateCode',
          header: 'المحافظة',
          cell: (info) => info.getValue() ?? '—',
        }),
        siteColumnHelper.accessor('location', {
          id: 'location',
          header: 'العنوان',
          cell: (info) => info.getValue() ?? '—',
        }),
        siteColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              siteColumnHelper.display({
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

  const page = sitesQuery.data
  const totalCount = page?.totalItems
  const totalPages = Math.max(page?.totalPages ?? 1, 1)
  const isStatusTargetActive = statusTarget?.status === 'Active'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="المواقع"
        subtitle="دليل المواقع المعتمد ضمن نطاق العمل الحالي."
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-52">
              <span className="text-sm font-medium text-foreground">حالة الموقع</span>
              <Select value={status ?? 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="تصفية حسب حالة الموقع">
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
                إضافة موقع
              </Button>
            ) : null}
          </div>
        }
      />

      <ContentCard
        title="قائمة المواقع"
        description="ابحث في المواقع أو صفِّ النتائج حسب الحالة، ثم تنقّل بين صفحات الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, sitesQuery.isError)}
          isLoading={sitesQuery.isLoading}
          isError={sitesQuery.isError}
          onRetry={() => void sitesQuery.refetch()}
          errorTitle="تعذّر تحميل المواقع"
          errorMessage="تعذّر جلب قائمة المواقع. حاول مرة أخرى."
          emptyTitle="لا توجد مواقع"
          emptyDescription="لم يتم العثور على مواقع تطابق معايير البحث الحالية."
          emptyAction={
            canManage ? (
              <Button type="button" onClick={openCreate}>
                إضافة موقع
              </Button>
            ) : undefined
          }
          page={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث بالاسم أو الرمز أو المحافظة..."
        />
      </ContentCard>
      <SiteFormDialog
        open={dialogSite !== undefined}
        site={dialogSite ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل موقع' : 'تنشيط موقع'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم الموقع ظاهراً في الوحدات والمستودعات المرتبطة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم الموقع متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الموقع' : 'تنشيط الموقع'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default SitesListPage
