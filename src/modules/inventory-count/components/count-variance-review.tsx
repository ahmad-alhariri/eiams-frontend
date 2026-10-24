import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'

import { CountMaterialName } from '@/modules/inventory-count/components/count-name-fields'
import { useAllCountLinesQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import type {
  CountSummary,
  InventoryCountLine,
} from '@/modules/inventory-count/types/inventory-count.types'
import { summarizeCountLines } from '@/modules/inventory-count/utils/count-review'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { toArabicDigits } from '@/shared/utils/format'
import { listRows } from '@/shared/utils/table-data'

/** Rows per review page; the shared bar offers 10/25/50/100. */
const REVIEW_PAGE_SIZE = 50

const countLineColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCountLine>()

/**
 * Server-owned result label; never derived from a client-side recompute. The
 * server `difference` is null-guarded; an unentered line is «لم تُدخل الكمية
 * بعد», never a manufactured shortage.
 */
function reviewResultAr(line: InventoryCountLine): string {
  if (line.actualQuantity == null) return 'لم تُدخل الكمية بعد'
  return (line.difference ?? 0) === 0 ? 'مطابق' : 'عنده فرق'
}

const countLineColumns = countLineColumnHelper.columns([
  countLineColumnHelper.accessor('materialId', {
    id: 'material',
    header: 'المادة',
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <CountMaterialName materialId={row.original.materialId} />
        {isAssetCountLine(row.original) ? (
          <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            أصل مسسلسيل · {row.original.assetId}
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
  countLineColumnHelper.accessor('difference', {
    id: 'difference',
    header: 'الفرق',
    // Straight from the server read model (null-guarded), but an unentered line
    // is never presented as a zero difference: kc7v forbids treating null as
    // zero, because the snapshot 0 simply reflects that nothing was counted.
    cell: ({ row }) => {
      const line = row.original
      if (line.actualQuantity == null) {
        return <span className="ltr text-muted-foreground">—</span>
      }
      const difference = line.difference
      if (difference === null) {
        return <span className="ltr text-muted-foreground">—</span>
      }
      return (
        <span className={`ltr ${difference !== 0 ? 'text-destructive' : ''}`}>
          {difference > 0 ? `+${difference}` : difference}
        </span>
      )
    },
  }),
  countLineColumnHelper.accessor('varianceReason', {
    id: 'varianceReason',
    header: 'سبب الفرق',
    cell: ({ row }) => {
      if (row.original.actualQuantity == null) {
        return <span className="text-muted-foreground">—</span>
      }
      if ((row.original.difference ?? 0) === 0) {
        return <span className="text-muted-foreground">—</span>
      }
      const reason = (row.original.varianceReason ?? '').trim()
      return reason === '' ? (
        <span className="text-destructive">لم يُدخل سبب الفرق بعد.</span>
      ) : (
        <span>{reason}</span>
      )
    },
  }),
  countLineColumnHelper.accessor('actualQuantity', {
    id: 'result',
    header: 'النتيجة',
    cell: ({ row }) => {
      const label = reviewResultAr(row.original)
      const isUnentered = row.original.actualQuantity == null
      return <span className={isUnentered ? 'text-muted-foreground' : undefined}>{label}</span>
    },
  }),
])

/**
 * Variance review (e20-t07, eiams-frontend-hbfu). Read-only rendering of the
 * lines with the server difference and reasons; the count's totals come from
 * the server `summary` — never recomputed from a local bucketing (F7).
 * The client-side buckets remain ONLY for the completion gate and the
 * «دون سبب» badge, which the summary does not carry.
 */
export function CountVarianceReview({
  countId,
  summary,
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
  summary: CountSummary
  canComplete: boolean
  canClose: boolean
  onComplete: () => void
  onClose: () => void
  isCompleting: boolean
  isClosing: boolean
  completeError?: string | null
  closeError?: string | null
}) {
  const can = usePermission()
  const pagination = useServerPagination({ initialPageSize: REVIEW_PAGE_SIZE })
  const { page, pageSize, offset, setPage, setPageSize } = pagination
  const linesQuery = useAllCountLinesQuery(countId)
  const items = useMemo(
    () => (linesQuery.data ?? []) as readonly InventoryCountLine[],
    [linesQuery.data],
  )
  const visibleRows = useMemo(
    () => listRows(items.slice(offset, offset + pageSize), false),
    [items, offset, pageSize],
  )

  const { missingReason, unentered } = useMemo(() => summarizeCountLines(items), [items])

  if (linesQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل بنود الفروقات..." />
  }
  if (linesQuery.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل بنود الفروقات"
        description="لم يكتمل تحميل جميع صفحات البنود. حاول مرة أخرى."
        action={
          <Button
            type="button"
            variant="outline"
            disabled={linesQuery.isFetching}
            onClick={() => void linesQuery.refetch()}
          >
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  const completeBlocked = missingReason.length > 0 || unentered.length > 0
  const canTriggerComplete =
    canComplete && can.has('count.complete') && !completeBlocked && !isCompleting

  return (
    <div dir="rtl" className="grid gap-5">
      {/* The four totals are the server's summary, verbatim (F7). */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm">
        <span>
          إجمالي البنود:{' '}
          <strong className="text-foreground">{toArabicDigits(summary.totalLines)}</strong>
        </span>
        <span>
          أُدخلت:{' '}
          <strong className="text-foreground">{toArabicDigits(summary.countedLines)}</strong>
        </span>
        <span>
          ذات فرق:{' '}
          <strong className="text-foreground">{toArabicDigits(summary.varianceLines)}</strong>
        </span>
        <span>
          إجمالي الفرق (مطلق):{' '}
          <strong className="text-foreground">
            {toArabicDigits(summary.totalAbsoluteDifference)}
          </strong>
        </span>
        {missingReason.length > 0 ? (
          <span>
            دون سبب:{' '}
            <strong className="text-destructive">{toArabicDigits(missingReason.length)}</strong>
          </span>
        ) : null}
      </div>

      {unentered.length > 0 ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">بنود لم تُدخل كمياتها الفعلية</h3>
          <p className="text-sm text-muted-foreground">
            أدخل الكمية الفعلية لكل بند في بنود الجرد؛ الكمية غير المدخلة ليست صفراً ولا تُعدّ
            فرقاً.
          </p>
        </section>
      ) : null}

      <DataTableServer
        columns={countLineColumns}
        data={visibleRows}
        emptyTitle="لا توجد بنود في هذه الجلسة"
        emptyDescription="لم يُلتقط أي بند ضمن نطاق هذه الجلسة. راجع نطاق الجرد ثم أعد تحميل الصفحة."
        page={page}
        pageSize={pageSize}
        totalCount={items.length}
        totalPages={pagination.pageCount(items.length)}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {canComplete && can.has('count.complete') ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onComplete} disabled={!canTriggerComplete}>
            {isCompleting ? 'جارٍ الإكمال...' : 'إكمال الجلسة'}
          </Button>
          {unentered.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              لا يمكن إكمال الجلسة قبل إدخال الكمية الفعلية لكل بند ({unentered.length} بند).
            </p>
          ) : null}
          {missingReason.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              لا يمكن إكمال الجلسة قبل إدخال سبب لكل بند ذي فرق ({missingReason.length} بند).
            </p>
          ) : null}
          {completeError ? (
            <p role="alert" className="text-sm text-destructive">
              {completeError}
            </p>
          ) : null}
        </div>
      ) : null}

      {can.has('count.close') && canClose ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onClose} disabled={isClosing} variant="outline">
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
