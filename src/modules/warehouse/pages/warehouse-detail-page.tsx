import { IconArrowRight, IconEdit } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { WarehouseCapabilitiesOverview } from '@/modules/warehouse/components/warehouse-capabilities-overview'
import { WarehouseMaterialSettingsOverview } from '@/modules/warehouse/components/warehouse-material-settings-overview'
import { WarehouseFormDialog } from '@/modules/warehouse/components/warehouse-form-dialog'
import { useUpdateWarehouseMutation } from '@/modules/warehouse/hooks/use-warehouse-mutations'
import { useWarehouseQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import {
  toWarehouseRequest,
  type WarehouseFormValues,
} from '@/modules/warehouse/schemas/warehouse.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'

/** Contract-backed warehouse profile. Capabilities and material settings stay in their dedicated flows. */
function WarehouseDetailPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const warehouseQuery = useWarehouseQuery(warehouseId)
  const updateMutation = useUpdateWarehouseMutation()
  const submitFeedback = useSubmitFeedback()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const warehouse = warehouseQuery.data
  const canManage = has('warehouse.manage')
  const returnToWarehouses = useCallback(() => navigate(ROUTE_PATHS.warehouses), [navigate])

  const submitForm = useCallback(
    async (values: WarehouseFormValues) => {
      if (warehouse === undefined) return
      await submitFeedback(async () => {
        await updateMutation.mutateAsync({
          warehouseId: warehouse.warehouseId,
          request: toWarehouseRequest(values, warehouse),
        })
        setIsEditDialogOpen(false)
        toast.success({ title: 'تم حفظ تعديلات المستودع.' })
      })
    },
    [submitFeedback, updateMutation, warehouse],
  )

  if (warehouseId === undefined || warehouseId === '')
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد المستودع"
          description="رابط المستودع غير مكتمل. ارجع إلى القائمة ثم اختر مستودعاً صالحاً."
          action={
            <Button type="button" onClick={returnToWarehouses}>
              العودة إلى المستودعات
            </Button>
          }
        />
      </div>
    )
  if (warehouseQuery.isPending)
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل المستودع" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل المستودع..." />
        </ContentCard>
      </div>
    )
  if (warehouseQuery.isError || warehouse === undefined)
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل المستودع"
          description="تعذّر جلب بيانات المستودع. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void warehouseQuery.refetch()}>
                إعادة المحاولة
              </Button>
              <Button type="button" variant="outline" onClick={returnToWarehouses}>
                العودة إلى المستودعات
              </Button>
            </div>
          }
        />
      </div>
    )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={warehouse.nameAr}
        subtitle={`رمز المستودع: ${warehouse.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button type="button" onClick={() => setIsEditDialogOpen(true)}>
                <IconEdit aria-hidden data-icon="inline-start" />
                تعديل المستودع
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={returnToWarehouses}>
              <IconArrowRight aria-hidden data-icon="inline-start" />
              العودة إلى المستودعات
            </Button>
          </div>
        }
      />
      <ContentCard
        title="بيانات المستودع"
        description="بيانات مرجعية للقراءة ضمن نطاق العمل الحالي."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="اسم المستودع">{warehouse.nameAr}</DetailField>
          <DetailField label="رمز المستودع" ltr>
            {warehouse.code}
          </DetailField>
          <DetailField label="الموقع">{warehouse.site.displayName}</DetailField>
          <DetailField label="الحالة">
            <StatusBadge entity="record" status={warehouse.status} />
          </DetailField>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-muted-foreground">الموقع التفصيلي</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground">
              {warehouse.locationAr ?? '—'}
            </dd>
          </div>
        </dl>
      </ContentCard>
      <WarehouseCapabilitiesOverview warehouseId={warehouse.warehouseId} />
      <WarehouseMaterialSettingsOverview warehouseId={warehouse.warehouseId} />
      <WarehouseFormDialog
        open={isEditDialogOpen}
        warehouse={warehouse}
        isPending={updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setIsEditDialogOpen(false)
        }}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default WarehouseDetailPage
