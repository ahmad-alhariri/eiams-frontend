import { createColumnHelper } from '@tanstack/react-table'
import { useMemo } from 'react'

import {
  MAX_COUNT_LINE_REVIEW_LINES,
  useAllCountLinesQuery,
} from '@/modules/inventory-count/hooks/use-count-queries'
import {
  countLineVariance,
  isAssetCountLine,
} from '@/modules/inventory-count/types/inventory-count.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toArabicDigits } from '@/shared/utils/format'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/** Rows paged client-side out of the fully-loaded session (hbfu). */
const REVIEW_PAGE_SIZE = 50

const countLineColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCountLine>()

/**
 * Variance review (e20-t07, hbfu).
 *
 * The review reads the WHOLE session through `useAllCountLinesQuery` and pages
 * that complete set client-side, because the completion gate depends on every
 * variance line carrying a reason. Paging the *read* would silently drop the
 * lines beyond the first page out of the gate, so the read is exhaustive and
 * the pagination bar is presentational only.
 */
export function CountVarianceReview({
  countId,
  canComplete,
  canClose,
  onComplete,
  onClose,
  isCompleting,
  isClosing,
  completeError,
  closeError,
}: {
  countId: string
  canComplete: boolean
  canClose: boolean
  onComplete: () => void
  onClose: () => void
  isCompleting: boolean
  isClosing: boolean
  completeError?: string | null
  closeError?: string | null
}) {
  const { has } = usePermission()
  const pagination = useServerPagination({ initialPageSize: REVIEW_PAGE_SIZE })
  const { page, pageSize, offset, setPage, setPageSize } = pagination
  const review = useAllCountLinesQuery(countId)
  const lines = review.lines

  const { matchingCount, varianceCount, missingReasonCount } = useMemo(() => {
    let matching = 0
    let variance = 0
    let missingReason = 0
    for (const line of lines) {
      if (countLineVariance(line) === 0) {
        matching += 1
        continue
      }
      variance += 1
      if ((line.reason ?? '').trim() === '') {
        missingReason += 1
      }
    }
    return { matchingCount: matching, varianceCount: variance, missingReasonCount: missingReason }
  }, [lines])

  const visibleRows = useMemo(
    () => lines.slice(offset, offset + pageSize),
    [lines, offset, pageSize],
  )

  const columns = useMemo(
    () =>
      countLineColumnHelper.columns([
        countLineColumnHelper.accessor((line) => line.material.displayName, {
          id: 'material',
          header: 'المادة',
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
              <span>{row.original.material.displayName}</span>
              {isAssetCountLine(row.original) ? (
                <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  أصل مسلسل
                  {row.original.assetNumber != null ? ` · ${row.original.assetNumber}` : ''}
                </span>
              ) : null}
            </div>
          ),
        }),
        countLineColumnHelper.accessor('snapshotQuantity', {
          id: 'snapshotQuantity',
          header: 'الكمية الدفترية',
          cell: ({ getValue }) => <span className="ltr">{getValue()}</span>,
        }),
        countLineColumnHelper.accessor('actualQuantity', {
          id: 'actualQuantity',
          header: 'الكمية الفعلية',
          cell: ({ getValue }) => <span className="ltr">{getValue() ?? '—'}</span>,
        }),
        countLineColumnHelper.display({
          id: 'difference',
          header: 'الفرق',
          cell: ({ row }) => {
            const difference = countLineVariance(row.original)
            return (
              <span className={`ltr ${difference !== 0 ? 'text-destructive' : ''}`}>
                {difference > 0 ? `+${difference}` : difference}
              </span>
            )
          },
        }),
        countLineColumnHelper.accessor('reason', {
          id: 'reason',
          header: 'سبب الفرق',
          cell: ({ row }) => {
            if (countLineVariance(row.original) === 0) {
              return <span className="text-muted-foreground">—</span>
            }
            const reason = (row.original.reason ?? '').trim()
            return reason === '' ? (
              <span className="text-destructive">لم يُدخل سبب الفرق بعد.</span>
            ) : (
              <span>{reason}</span>
            )
          },
        }),
        countLineColumnHelper.display({
          id: 'result',
          header: 'النتيجة',
          cell: ({ row }) =>
            countLineVariance(row.original) === 0 ? (
              <span className="text-muted-foreground">مطابق</span>
            ) : (
              <span className="text-destructive">عنده فرق</span>
            ),
        }),
      ]),
    [],
  )

  if (review.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل بنود الفروقات..." />
  }

  if (review.isOversized) {
    return (
      <ErrorState
        title="جلسة جرد أكبر من حدود المراجعة"
        description={`تحتوي هذه الجلسة على أكثر من ${toArabicDigits(MAX_COUNT_LINE_REVIEW_LINES)} بند ولا يمكن عرضها كاملة في الوقت الحالي. راجع نطاق الجرد أو قسّم الجلسة إلى جلسات أصغر.`}
      />
    )
  }

  if (review.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل بنود الفروقات"
        description="تعذّر جلب بنود هذه الجلسة. حاول مرة أخرى."
        action={
          <Button variant="outline" onClick={review.refetch}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  const completeBlocked = missingReasonCount > 0
  const canTriggerComplete =
    canComplete && has('count.complete') && !completeBlocked && !isCompleting

  return (
    <div dir="rtl" className="grid gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm">
        <span>
          إجمالي البنود: <strong className="text-foreground">{toArabicDigits(lines.length)}</strong>
        </span>
        <span>
          مطابقة: <strong className="text-foreground">{toArabicDigits(matchingCount)}</strong>
        </span>
        <span>
          ذات فرق: <strong className="text-foreground">{toArabicDigits(varianceCount)}</strong>
        </span>
        <span>
          دون سبب:{' '}
          <strong className="text-destructive">{toArabicDigits(missingReasonCount)}</strong>
        </span>
      </div>

      <DataTableServer
        columns={columns}
        data={visibleRows}
        emptyTitle="لا توجد بنود في هذه الجلسة"
        emptyDescription="لم يُلتقط أي بند ضمن نطاق هذه الجلسة. راجع نطاق الجرد ثم أعد تحميل الصفحة."
        page={page}
        pageSize={pageSize}
        totalCount={lines.length}
        totalPages={pagination.pageCount(lines.length)}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {has('count.complete') ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onComplete} disabled={!canTriggerComplete}>
            {isCompleting ? 'جارٍ الإكمال...' : 'إكمال الجلسة'}
          </Button>
          {completeBlocked ? (
            <p role="alert" className="text-sm text-destructive">
              لا يمكن إكمال الجلسة قبل إدخال سبب لكل بند ذي فرق (
              {toArabicDigits(missingReasonCount)} بند).
            </p>
          ) : null}
          {completeError ? (
            <p role="alert" className="text-sm text-destructive">
              {completeError}
            </p>
          ) : null}
        </div>
      ) : null}

      {has('count.close') && canClose ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isClosing}>
            {isClosing ? 'جارٍ الإغلاق...' : 'إغلاق الجلسة'}
          </Button>
          {closeError ? (
            <p role="alert" className="text-sm text-destructive">
              {closeError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
