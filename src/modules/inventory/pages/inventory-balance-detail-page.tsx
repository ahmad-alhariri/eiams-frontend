import { IconArrowRight } from '@tabler/icons-react'
import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { InventoryLowStockBadge } from '@/modules/inventory/components/inventory-low-stock-badge'
import { useInventoryBalanceQuery } from '@/modules/inventory/hooks/use-inventory-queries'
import { arabicCopyForCode } from '@/shared/api/error-copy-ar'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { formatDateTime, formatNumber, formatUuid } from '@/shared/utils/format'

/**
 * Read-only, scope-authorized balance projection. Related warehouse settings,
 * material hierarchy, and movement history remain separate contract reads.
 */
function InventoryBalanceDetailPage() {
  const { balanceId } = useParams<{ balanceId: string }>()
  const navigate = useNavigate()
  const balanceQuery = useInventoryBalanceQuery(balanceId)
  const balance = balanceQuery.data
  const returnToBalances = useCallback(() => navigate(ROUTE_PATHS.inventoryBalances), [navigate])

  if (balanceId === undefined || balanceId === '') {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الرصيد" />
        <ErrorState
          title="تعذّر تحديد الرصيد"
          description="رابط الرصيد غير مكتمل. ارجع إلى قائمة الأرصدة ثم اختر سجلاً صالحاً."
          action={
            <Button type="button" onClick={returnToBalances}>
              العودة إلى الأرصدة
            </Button>
          }
        />
      </div>
    )
  }

  if (balanceQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الرصيد" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل الرصيد..." />
        </ContentCard>
      </div>
    )
  }

  if (balanceQuery.isError || balance === undefined) {
    const apiError = normalizeApiError(balanceQuery.error)
    const isNotFound = apiError.status === 404
    const title = isNotFound ? 'الرصيد غير متاح' : 'تعذّر تحميل تفاصيل الرصيد'
    // Prefer the shared code table's copy; `detailAr` is null for many codes
    // (including a 401), so its `titleAr` is what keeps the message specific.
    // The connection sentence remains only for a code the table does not cover.
    const sharedCopy = arabicCopyForCode(apiError.code)
    const description = isNotFound
      ? 'لا يتوفر هذا الرصيد ضمن نطاق العمل الحالي، أو لم يعد موجوداً.'
      : (sharedCopy?.detailAr ??
        sharedCopy?.titleAr ??
        apiError.detailAr ??
        'تعذّر جلب بيانات الرصيد. تحقق من الاتصال ثم أعد المحاولة.')

    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الرصيد" />
        <ErrorState
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!isNotFound ? (
                <Button type="button" onClick={() => void balanceQuery.refetch()}>
                  إعادة المحاولة
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={returnToBalances}>
                العودة إلى الأرصدة
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
        title="تفاصيل الرصيد"
        subtitle={`${balance.warehouseName} — ${balance.materialNameAr}`}
        actions={
          <Button type="button" variant="outline" onClick={returnToBalances}>
            <IconArrowRight aria-hidden data-icon="inline-start" />
            العودة إلى الأرصدة
          </Button>
        }
      />

      <ContentCard
        title="بيانات الرصيد"
        description="بيانات للقراءة فقط ضمن نطاق العمل الحالي، كما يعرضها الخادم."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="المستودع">{balance.warehouseName}</DetailField>
          <DetailField label="المادة">{balance.materialNameAr}</DetailField>
          <DetailField label="الرصيد الحالي" ltr>
            {formatNumber(balance.quantity, { maxFractionDigits: 3 })}
          </DetailField>
          <DetailField label="حالة التنبيه">
            <InventoryLowStockBadge state={balance.lowStock.state} />
          </DetailField>
          <DetailField label="حدّ التنبيه" ltr>
            {balance.lowStock.thresholdQuantity === null
              ? '—'
              : formatNumber(balance.lowStock.thresholdQuantity, { maxFractionDigits: 3 })}
          </DetailField>
          <DetailField label="آخر تحديث">{formatDateTime(balance.lastUpdatedUtc)}</DetailField>
          <DetailField label="معرّف الرصيد" ltr>
            {formatUuid(balance.id)}
          </DetailField>
        </dl>
      </ContentCard>
    </div>
  )
}

export default InventoryBalanceDetailPage
