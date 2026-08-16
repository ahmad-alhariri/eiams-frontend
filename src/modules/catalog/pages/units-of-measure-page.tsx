import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { UnitOfMeasureFormDialog } from '@/modules/catalog/components/unit-of-measure-form-dialog'
import {
  useCreateUnitOfMeasureMutation,
  useUpdateUnitOfMeasureMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import { useUnitsOfMeasureQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toUnitOfMeasureRequest,
  type UnitOfMeasureFormValues,
} from '@/modules/catalog/schemas/unit-of-measure.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { DataTable, dataTableFeatures } from '@/shared/ui/data-table'
import { toast } from '@/shared/ui/toast-manager'
import { listRows } from '@/shared/utils/table-data'
import type { UnitOfMeasure } from '@/shared/types/generated/eiams-v1'

const unitColumnHelper = createColumnHelper<typeof dataTableFeatures, UnitOfMeasure>()

/** The v1 contract returns all units in one reference-data response. */
function UnitsOfMeasurePage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const unitsQuery = useUnitsOfMeasureQuery()
  const createMutation = useCreateUnitOfMeasureMutation()
  const updateMutation = useUpdateUnitOfMeasureMutation()
  const [dialogUnit, setDialogUnit] = useState<UnitOfMeasure | null | undefined>(undefined)

  const openCreate = useCallback(() => setDialogUnit(null), [])
  const openEdit = useCallback((unit: UnitOfMeasure) => setDialogUnit(unit), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogUnit(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: UnitOfMeasureFormValues) => {
      const unit = dialogUnit ?? null
      try {
        const request = toUnitOfMeasureRequest(values, unit)
        if (unit === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة وحدة القياس.' })
        } else {
          await updateMutation.mutateAsync({ unitId: unit.unitId, request })
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

  const columns = useMemo(
    () =>
      unitColumnHelper.columns([
        unitColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم الوحدة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        unitColumnHelper.accessor('symbolAr', { id: 'symbolAr', header: 'رمز العرض' }),
        unitColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
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

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="وحدات القياس"
        subtitle="مرجع الوحدات المستخدم في تعريف المواد. إدارة التحويلات تتم في مسار مستقل."
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
        description="جميع الوحدات المتاحة ضمن نطاق العمل الحالي، مع عرض السجلات غير النشطة للحفاظ على المراجع التاريخية."
      >
        <DataTable
          columns={columns}
          data={listRows(unitsQuery.data, unitsQuery.isError)}
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
        />
      </ContentCard>
      <UnitOfMeasureFormDialog
        open={dialogUnit !== undefined}
        unit={dialogUnit ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default UnitsOfMeasurePage
