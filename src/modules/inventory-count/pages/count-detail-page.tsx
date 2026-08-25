import { useParams } from 'react-router'

import {
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
} from '@/modules/inventory-count/types/inventory-count.types'
import {
  useCompleteCountMutation,
  useCloseCountMutation,
  useInventoryCountQuery,
  useStartCountMutation,
} from '@/modules/inventory-count/hooks/use-count-queries'
import { CountQuantityWorkspace } from '@/modules/inventory-count/components/count-quantity-workspace'
import { CountVarianceReview } from '@/modules/inventory-count/components/count-variance-review'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'

/**
 * Count detail page (e20-t04 scope/snapshot preview + e20-t05 start action +
 * e20-t06 quantity workspace + e20-t07 variance review & complete gate).
 * Shows the session spine and the phase-appropriate workspace: planned →
 * start; in-progress → quantity entry; completed/closed → variance review.
 */
export default function CountDetailPage() {
  const { countId } = useParams<{ countId: string }>()
  const countQuery = useInventoryCountQuery(countId)
  const startMutation = useStartCountMutation(countId ?? '')
  const completeMutation = useCompleteCountMutation(countId ?? '')
  const closeMutation = useCloseCountMutation(countId ?? '')
  const { confirm: openConfirm, element: confirmDialog } = useConfirm()
  const count = countQuery.data

  if (countQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل جلسة الجرد..." />
  }
  if (countQuery.isError || count === undefined) {
    return (
      <ErrorState
        title="تعذّر تحميل جلسة الجرد"
        description="تعذّر جلب بيانات هذه الجلسة. حاول مرة أخرى."
        action={
          <Button variant="outline" onClick={() => void countQuery.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  const handleStart = async () => {
    const confirmed = await openConfirm({
      title: 'بدء جلسة الجرد',
      message:
        'سيتم التقاط لقطة من أرصدة المستودع الحالية ككميات دفترية للجلسة، وستصبح الجلسة جارية. هل تريد المتابعة؟',
      confirmLabel: 'بدء الجلسة',
    })
    if (confirmed.confirmed) {
      startMutation.mutate(count.rowVersion)
    }
  }

  const handleComplete = async () => {
    const confirmed = await openConfirm({
      title: 'إكمال الجلسة',
      message: 'سيُحسب عدد البنود ذات الفرق ويُقفل الجرد. تأكد من إدخال سبب لكل فرق قبل الإكمال.',
      confirmLabel: 'إكمال',
    })
    if (confirmed.confirmed) {
      completeMutation.mutate(count.rowVersion)
    }
  }

  const handleClose = async () => {
    const confirmed = await openConfirm({
      title: 'إغلاق الجلسة',
      message: 'سيُغلق الجرد نهائياً ولا يمكن تعديله بعد الإغلاق. هل تريد المتابعة؟',
      confirmLabel: 'إغلاق',
    })
    if (confirmed.confirmed) {
      closeMutation.mutate(count.rowVersion)
    }
  }

  const isActive = count.status === 'InProgress'
  const isReviewable =
    count.status === 'InProgress' || count.status === 'Completed' || count.status === 'Closed'
  const canComplete = count.status === 'InProgress'
  const canClose = count.status === 'Completed'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={`${INVENTORY_COUNT_TYPE_LABELS_AR[count.countType]} — ${count.referenceNumber}`}
        subtitle={count.scope.summaryAr ?? undefined}
      />
      <div className="grid gap-5">
        <ContentCard title="بيانات الجلسة">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="الحالة">
              {INVENTORY_COUNT_STATUS_LABELS_AR[count.status]}
            </DetailField>
            <DetailField label="المستودع">{count.warehouse.displayName}</DetailField>
            <DetailField label="نوع الجرد">
              {INVENTORY_COUNT_TYPE_LABELS_AR[count.countType]}
            </DetailField>
            <DetailField label="سياسة التجميد">تجميد مرن (SoftFreeze)</DetailField>
            <DetailField label="النطاق">
              {count.scope.summaryAr ?? INVENTORY_COUNT_SCOPE_LABELS_AR[count.scope.scopeType]}
            </DetailField>
            <DetailField label="أُنشئت بواسطة">{count.createdBy.displayName}</DetailField>
            <DetailField label="بدأت في" ltr>
              {count.startedAt ?? '—'}
            </DetailField>
            <DetailField label="اكتملت في" ltr>
              {count.completedAt ?? '—'}
            </DetailField>
            <DetailField label="أُغلقت في" ltr>
              {count.closedAt ?? '—'}
            </DetailField>
          </dl>
        </ContentCard>

        {count.notes !== null && count.notes !== undefined ? (
          <ContentCard title="ملاحظات">
            <p className="text-sm text-muted-foreground">{count.notes}</p>
          </ContentCard>
        ) : null}

        {count.status === 'Planned' ? (
          <ContentCard
            title="لقطة الأرصدة"
            description="عند بدء الجلسة يلتقط الخادم كميات الأرصدة الحالية ككميات دفترية لكل بند ضمن النطاق، وتنتقل الجلسة إلى قيد التنفيذ."
          >
            <Button onClick={() => void handleStart()} disabled={startMutation.isPending}>
              {startMutation.isPending ? 'جارٍ البدء...' : 'بدء الجلسة والتقاط اللقطة'}
            </Button>
            {startMutation.error !== null ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                تعذّر بدء الجلسة. تحقق من عدم وجود جلسة جارية أخرى لنفس المستودع.
              </p>
            ) : null}
          </ContentCard>
        ) : null}

        {isActive ? (
          <ContentCard title="بنود الجرد">
            <CountQuantityWorkspace countId={count.countId} countRowVersion={count.rowVersion} />
          </ContentCard>
        ) : null}

        {isReviewable ? (
          <ContentCard title="مراجعة الفروقات">
            <CountVarianceReview
              countId={count.countId}
              canComplete={canComplete}
              canClose={canClose}
              onComplete={() => void handleComplete()}
              onClose={() => void handleClose()}
              isCompleting={completeMutation.isPending}
              isClosing={closeMutation.isPending}
              completeError={
                completeMutation.error === null
                  ? null
                  : 'تعذّر إكمال الجلسة. تحقق من تسجيل أسباب الفروقات أو حدّث الصفحة.'
              }
              closeError={
                closeMutation.error === null
                  ? null
                  : 'تعذّر إغلاق الجلسة. حدّث الصفحة وحاول مجدداً.'
              }
            />
          </ContentCard>
        ) : null}
      </div>
      {confirmDialog}
    </div>
  )
}
