import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { WarehouseFormDialog } from '@/modules/warehouse/components/warehouse-form-dialog'
import {
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
} from '@/modules/warehouse/hooks/use-warehouse-mutations'
import { useSitesQuery } from '@/modules/organization/hooks/use-organization-queries'
import { useWarehousesQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import {
  toWarehouseRequest,
  type WarehouseFormValues,
} from '@/modules/warehouse/schemas/warehouse.schemas'
import type { ListWarehousesQuery } from '@/modules/warehouse/types/warehouse.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { RecordStatus, Warehouse } from '@/shared/types/generated/eiams-v1'

const warehouseColumnHelper = createColumnHelper<typeof dataTableFeatures, Warehouse>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Contract-backed, scoped warehouse directory. The server owns paging,
 * search, and the two supported list filters; this page never creates a local
 * warehouse collection or exposes write behaviour.
 */
function WarehousesListPage() {
  const { has } = usePermission()
  const canManage = has('warehouse.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [siteId, setSiteId] = useState<string | undefined>()
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogWarehouse, setDialogWarehouse] = useState<Warehouse | null | undefined>(undefined)

  const warehousesQueryInput = useMemo<ListWarehousesQuery>(
    () => ({
      // DataTable controls are 1-based; EIAMS v1 list endpoints are 0-based.
      pageIndex: currentPage - 1,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(siteId === undefined ? {} : { siteId }),
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, pageSize, search, siteId, status],
  )
  const warehousesQuery = useWarehousesQuery(warehousesQueryInput)
  const sitesQuery = useSitesQuery({ pageIndex: 0, pageSize: 200, status: 'Active' })
  const createMutation = useCreateWarehouseMutation()
  const updateMutation = useUpdateWarehouseMutation()
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

  const openCreate = useCallback(() => setDialogWarehouse(null), [])
  const openEdit = useCallback((warehouse: Warehouse) => setDialogWarehouse(warehouse), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogWarehouse(undefined)
  }, [])
  const submitForm = useCallback(
    async (values: WarehouseFormValues) => {
      const warehouse = dialogWarehouse ?? null
      await submitFeedback(async () => {
        const request = toWarehouseRequest(values, warehouse)
        if (warehouse === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة المستودع.' })
        } else {
          await updateMutation.mutateAsync({ warehouseId: warehouse.warehouseId, request })
          toast.success({ title: 'تم حفظ تعديلات المستودع.' })
        }
        setDialogWarehouse(undefined)
      })
    },
    [createMutation, dialogWarehouse, submitFeedback, updateMutation],
  )

  const columns = useMemo(
    () =>
      warehouseColumnHelper.columns([
        warehouseColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم المستودع',
          cell: ({ getValue, row }) => (
            <Link
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.warehouseDetail.replace(':warehouseId', row.original.warehouseId)}
            >
              {getValue()}
            </Link>
          ),
        }),
        warehouseColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        warehouseColumnHelper.accessor((warehouse) => warehouse.site.displayName, {
          id: 'site',
          header: 'الموقع',
        }),
        warehouseColumnHelper.accessor('locationAr', {
          id: 'locationAr',
          header: 'الموقع التفصيلي',
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        warehouseColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              warehouseColumnHelper.display({
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

  const page = warehousesQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="المستودعات"
        subtitle="دليل المستودعات المخوّلة ضمن نطاق العمل الحالي، للعرض والبحث فقط."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
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
                <SelectTrigger aria-label="تصفية حسب حالة المستودع">
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
              <div className="flex items-end">
                <Button type="button" onClick={openCreate}>
                  <IconPlus aria-hidden data-icon="inline-start" />
                  إضافة مستودع
                </Button>
              </div>
            ) : null}
          </div>
        }
      />

      <ContentCard
        title="قائمة المستودعات"
        description="ابحث بالاسم أو الرمز، وصفِّ النتائج حسب الموقع أو الحالة. تُنفَّذ النتائج والترقيم في الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, warehousesQuery.isError)}
          isLoading={warehousesQuery.isLoading}
          isError={warehousesQuery.isError}
          onRetry={() => void warehousesQuery.refetch()}
          errorTitle="تعذّر تحميل المستودعات"
          errorMessage="تعذّر جلب قائمة المستودعات. حاول مرة أخرى."
          emptyTitle="لا توجد مستودعات"
          emptyDescription="لم يتم العثور على مستودعات تطابق معايير البحث الحالية."
          emptyAction={
            canManage ? (
              <Button type="button" onClick={openCreate}>
                إضافة مستودع
              </Button>
            ) : undefined
          }
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث بالاسم أو الرمز..."
        />
      </ContentCard>
      <WarehouseFormDialog
        open={dialogWarehouse !== undefined}
        warehouse={dialogWarehouse ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default WarehousesListPage
