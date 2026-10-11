import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { UnitOfMeasureFormDialog } from '@/modules/catalog/components/unit-of-measure-form-dialog'
import {
  useCreateUnitOfMeasureMutation,
  useSetUnitOfMeasureStatusMutation,
  useUpdateUnitOfMeasureMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import { useUnitsOfMeasureQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toCreateUnitOfMeasureRequest,
  toUpdateUnitOfMeasureRequest,
  type UnitOfMeasureFormValues,
} from '@/modules/catalog/schemas/unit-of-measure.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { ListUnitsOfMeasureQuery } from '@/modules/catalog/types/catalog.api-types'
import type { RecordStatus, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'

const unitColumnHelper = createColumnHelper<typeof dataTableFeatures, UnitOfMeasure>()

/**
 * The v1 unit reference list: pagination only, no filter at all — not even
 * `status` — so this screen shows every record the server returns, inactive
 * ones included, and offers the status command per row.
 *
 * Pagination is `useServerPagination` + `DataTableServer`, the composition
 * `/catalog/materials` uses. `GET /catalog/units-of-measure` defaults to 20
 * rows a page, so the unparameterised query this screen used to send truncated
 * the directory at row 20 with nothing on screen able to reach the rest.
 */
function UnitsOfMeasurePage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const unitsQueryInput = useMemo<ListUnitsOfMeasureQuery>(
    () => ({ page: currentPage, pageSize }),
    [currentPage, pageSize],
  )
  const unitsQuery = useUnitsOfMeasureQuery(unitsQueryInput)
  const createMutation = useCreateUnitOfMeasureMutation()
  const updateMutation = useUpdateUnitOfMeasureMutation()
  const statusMutation = useSetUnitOfMeasureStatusMutation()
  const [dialogUnit, setDialogUnit] = useState<UnitOfMeasure | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<UnitOfMeasure | null>(null)

  const openCreate = useCallback(() => setDialogUnit(null), [])
  const openEdit = useCallback((unit: UnitOfMeasure) => setDialogUnit(unit), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogUnit(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: UnitOfMeasureFormValues) => {
      const unit = dialogUnit ?? null
      try {
        // Create and update carry the same three fields today but remain two
        // mappers: the update route binds its own record, and one "upsert" is
        // what let `status` and a version token ride along into a body that
        // binds neither.
        if (unit === null) {
          await createMutation.mutateAsync(toCreateUnitOfMeasureRequest(values))
          toast.success({ title: 'تمت إضافة وحدة القياس.' })
        } else {
          await updateMutation.mutateAsync({
            unitId: unit.id,
            request: toUpdateUnitOfMeasureRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات وحدة القياس.' })
        }
        setDialogUnit(undefined)
      } catch (error: unknown) {
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
        throw error
      }
    },
    [createMutation, dialogUnit, updateMutation],
  )

  /** One command, two directions; the ordinal is derived by the hook. */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({ unitId: statusTarget.id, status: nextStatus })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الوحدة مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الوحدة من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget])

  const columns = useMemo(
    () =>
      unitColumnHelper.columns([
        unitColumnHelper.accessor('name', {
          id: 'name',
          header: 'اسم الوحدة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        unitColumnHelper.accessor('symbol', {
          id: 'symbol',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        unitColumnHelper.accessor('unitType', {
          id: 'unitType',
          header: 'نوع الوحدة',
        }),
        unitColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              unitColumnHelper.display({
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
  const unitsPage = unitsQuery.data
  const totalCount = unitsPage?.totalItems
  const totalPages = Math.max(unitsPage?.totalPages ?? 1, 1)

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="وحدات القياس"
        subtitle="مرجع الوحدات المستخدم في تعريف المواد. إدارة التحويلات تتم لكل مادة على حدة."
        toolbar={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة وحدة قياس
            </Button>
          ) : undefined
        }
      />
      <ContentCard
        title="قائمة وحدات القياس"
        description="جميع الوحدات المتاحة ضمن نطاق العمل الحالي، مع عرض السجلات غير النشطة للحفاظ على المراجع التاريخية، وينفّذ الخادم التنقل بين الصفحات."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(unitsPage, unitsQuery.isError)}
          isLoading={unitsQuery.isLoading}
          isError={unitsQuery.isError}
          onRetry={() => void unitsQuery.refetch()}
          errorTitle="تعذّر تحميل وحدات القياس"
          errorMessage="تعذّر جلب قائمة وحدات القياس. حاول مرة أخرى."
          emptyTitle="لا توجد وحدات قياس"
          emptyDescription="أضف أول وحدة قياس لاستخدامها عند تعريف المواد."
          emptyAction={
            canManage ? (
              <Button type="button" onClick={openCreate}>
                إضافة وحدة قياس
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
      <UnitOfMeasureFormDialog
        open={dialogUnit !== undefined}
        unit={dialogUnit ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل وحدة قياس' : 'تنشيط وحدة قياس'}
        message={
          isStatusTargetActive
            ? 'ستبقى الوحدة ظاهرة في السجلات والمواد السابقة، لكنها لن تكون متاحة للاختيار عند تعريف مادة جديدة.'
            : 'ستصبح الوحدة متاحة مرة أخرى للاختيار عند تعريف مادة جديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الوحدة' : 'تنشيط الوحدة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default UnitsOfMeasurePage
