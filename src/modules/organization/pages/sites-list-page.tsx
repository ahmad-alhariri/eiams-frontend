import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { SiteFormDialog } from '@/modules/organization/components/site-form-dialog'
import {
  useCreateSiteMutation,
  useUpdateSiteMutation,
} from '@/modules/organization/hooks/use-site-mutations'
import { useSitesQuery } from '@/modules/organization/hooks/use-organization-queries'
import { toSiteRequest, type SiteFormValues } from '@/modules/organization/schemas/site.schemas'
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
import type { RecordStatus, Site } from '@/shared/types/generated/eiams-v1'

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
  const sitesQueryInput = useMemo(
    () => ({
      // Table controls are 1-based; EIAMS v1 list endpoints are 0-based.
      pageIndex: currentPage - 1,
      pageSize,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
    }),
    [currentPage, pageSize, search, status],
  )
  const sitesQuery = useSitesQuery(sitesQueryInput)
  const createMutation = useCreateSiteMutation()
  const updateMutation = useUpdateSiteMutation()
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

  const submitForm = useCallback(
    async (values: SiteFormValues) => {
      const site = dialogSite ?? null
      await submitFeedback(async () => {
        const request = toSiteRequest(values, site)
        if (site === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة الموقع.' })
        } else {
          await updateMutation.mutateAsync({ siteId: site.siteId, request })
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
        siteColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم الموقع',
          cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
        }),
        siteColumnHelper.accessor('code', { id: 'code', header: 'الرمز' }),
        siteColumnHelper.accessor('governorate', {
          id: 'governorate',
          header: 'المحافظة',
          cell: (info) => info.getValue() ?? '—',
        }),
        siteColumnHelper.accessor('address', {
          id: 'address',
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
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل ${row.original.nameAr}`}
                    onClick={() => openEdit(row.original)}
                  >
                    <IconEdit aria-hidden />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, openEdit],
  )

  const page = sitesQuery.data
  const totalCount = page?.meta.totalItems
  const totalPages = Math.max(page?.meta.totalPages ?? 1, 1)

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
        description="ابحث في المواقع أو صفِّ النتائج حسب الحالة، ثم تنقّل بين صفحات الخادم."
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
    </div>
  )
}

export default SitesListPage
