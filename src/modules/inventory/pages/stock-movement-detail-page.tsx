import { IconArrowRight } from '@tabler/icons-react'
import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { stockMovementTypeLabelAr } from '@/modules/inventory/components/stock-movement-labels'
import { useStockMovementQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { formatDateTime, formatNumber } from '@/shared/utils/format'

function formatSignedDelta(quantityDelta: number): string {
  const formatted = formatNumber(quantityDelta, { maxFractionDigits: 3 })
  return quantityDelta > 0 ? `+${formatted}` : formatted
}

/**
 * Scope-authorized immutable stock-movement provenance. The movement contract
 * deliberately exposes document IDs and a reference only; document type and
 * type-specific document links are not inferred by this read-only page.
 */
function StockMovementDetailPage() {
  const { movementId } = useParams<{ movementId: string }>()
  const navigate = useNavigate()
  const movementQuery = useStockMovementQuery(movementId)
  const movement = movementQuery.data
  const returnToMovements = useCallback(() => navigate(ROUTE_PATHS.inventoryMovements), [navigate])

  if (movementId === undefined || movementId === '') {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد الحركة"
          description="رابط الحركة غير مكتمل. ارجع إلى سجل الحركات ثم اختر سجلاً صالحاً."
          action={
            <Button type="button" onClick={returnToMovements}>
              العودة إلى الحركات
            </Button>
          }
        />
      </div>
    )
  }

  if (movementQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل حركة المخزون" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل الحركة..." />
        </ContentCard>
      </div>
    )
  }

  if (movementQuery.isError || movement === undefined) {
    const apiError = normalizeApiError(movementQuery.error)
    const isNotFound = apiError.status === 404
    const title = isNotFound ? 'الحركة غير متاحة' : 'تعذّر تحميل تفاصيل الحركة'
    const description = isNotFound
      ? 'لا تتوفر هذه الحركة ضمن نطاق العمل الحالي، أو لم تعد موجودة.'
      : (apiError.detailAr ?? 'تعذّر جلب بيانات الحركة. تحقق من الاتصال ثم أعد المحاولة.')

    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!isNotFound ? (
                <Button type="button" onClick={() => void movementQuery.refetch()}>
                  إعادة المحاولة
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={returnToMovements}>
                العودة إلى الحركات
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="تفاصيل حركة المخزون"
        subtitle={`${movement.warehouse.displayName} — ${movement.material.displayName}`}
        actions={
          <Button type="button" variant="outline" onClick={returnToMovements}>
            <IconArrowRight aria-hidden data-icon="inline-start" />
            العودة إلى الحركات
          </Button>
        }
      />

      <ContentCard
        title="إثبات مصدر الحركة"
        description="بيانات للقراءة فقط ضمن نطاق العمل الحالي، كما يعرضها الخادم."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="المستودع">{movement.warehouse.displayName}</DetailField>
          <DetailField label="المادة">{movement.material.displayName}</DetailField>
          <DetailField label="نوع الحركة">
            <Badge variant="outline">{stockMovementTypeLabelAr(movement.movementType)}</Badge>
          </DetailField>
          <DetailField label="التغير في الرصيد" ltr>
            <span
              className={
                movement.quantityDelta < 0
                  ? 'font-semibold text-destructive'
                  : 'font-semibold text-success'
              }
            >
              {formatSignedDelta(movement.quantityDelta)}
            </span>
          </DetailField>
          <DetailField label="تاريخ الترحيل">{formatDateTime(movement.postedAt)}</DetailField>
          <DetailField label="رُحّلت بواسطة">{movement.postedBy.displayName}</DetailField>
          <DetailField label="مرجع المستند" ltr>
            <span className="break-all">{movement.documentReference ?? '—'}</span>
          </DetailField>
          <DetailField label="معرّف المستند" ltr>
            <span className="break-all">{movement.documentId}</span>
          </DetailField>
          <DetailField label="معرّف سطر المستند" ltr>
            <span className="break-all">{movement.documentLineId}</span>
          </DetailField>
          <DetailField label="معرّف الحركة" ltr>
            <span className="break-all">{movement.movementId}</span>
          </DetailField>
        </dl>
      </ContentCard>
    </div>
  )
}

export default StockMovementDetailPage
