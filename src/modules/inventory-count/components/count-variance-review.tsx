import { useMemo } from 'react'

import { useAllCountLinesQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import { summarizeCountLines } from '@/modules/inventory-count/utils/count-review'
import { Button } from '@/shared/ui/button'

interface VarianceRow {
  line: InventoryCountLine
  difference: number
  hasReason: boolean
}

/**
 * Variance review (e20-t07). Read-only split of the lines into matching vs.
 * differing (variance) and unentered buckets. PRD §12.6 requires actual entry
 * before completion; retain the existing reason gate for nonzero differences.
 * All differences come from the server; the UI never treats null as zero.
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
  const can = usePermission()
  const linesQuery = useAllCountLinesQuery(countId)
  const items = useMemo(
    () => (linesQuery.data ?? []) as readonly InventoryCountLine[],
    [linesQuery.data],
  )

  const { matching, variance, missingReason, unentered } = useMemo(() => {
    const summary = summarizeCountLines(items)
    const toRow = (line: InventoryCountLine): VarianceRow => ({
      line,
      difference: line.difference,
      hasReason: (line.reason ?? '').trim() !== '',
    })
    return {
      ...summary,
      matching: summary.matching.map(toRow),
      variance: summary.variance.map(toRow),
    }
  }, [items])

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
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm">
        <span>
          إجمالي البنود: <strong className="text-foreground">{items.length}</strong>
        </span>
        <span>
          مطابقة: <strong className="text-foreground">{matching.length}</strong>
        </span>
        <span>
          ذات فرق: <strong className="text-foreground">{variance.length}</strong>
        </span>
        <span>
          لم تُدخل بعد: <strong className="text-foreground">{unentered.length}</strong>
        </span>
        <span>
          دون سبب: <strong className="text-destructive">{missingReason.length}</strong>
        </span>
      </div>

      {unentered.length > 0 ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">بنود لم تُدخل كمياتها الفعلية</h3>
          <p className="text-sm text-muted-foreground">
            أدخل الكمية الفعلية لكل بند في بنود الجرد؛ الكمية غير المدخلة ليست صفراً ولا تُعدّ
            فرقاً.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {unentered.map((line) => (
              <li
                key={line.countLineId}
                className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  {line.material.displayName}
                  {line.assetNumber ? ` · ${line.assetNumber}` : ''}
                </span>
                <span className="text-muted-foreground">الكمية الفعلية: لم تُدخل بعد</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h3 className="text-sm font-medium text-foreground">بنود مطابقة</h3>
        {matching.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بنود مطابقة.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {matching.map((row) => (
              <li
                key={row.line.countLineId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  {row.line.material.displayName}
                  {isAssetCountLine(row.line) ? (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      أصل مسلسل
                      {row.line.assetNumber !== undefined && row.line.assetNumber !== null
                        ? ` · ${row.line.assetNumber}`
                        : ''}
                    </span>
                  ) : null}
                </span>
                <span className="ltr text-muted-foreground">
                  {row.line.snapshotQuantity} → {row.line.actualQuantity ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium text-foreground">بنود ذات فرق</h3>
        {variance.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فروقات مسجّلة.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {variance.map((row) => (
              <li key={row.line.countLineId} className="grid gap-1 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {row.line.material.displayName}
                    {isAssetCountLine(row.line) ? (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        أصل مسلسل
                        {row.line.assetNumber !== undefined && row.line.assetNumber !== null
                          ? ` · ${row.line.assetNumber}`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="ltr text-destructive">
                    {row.line.snapshotQuantity} → {row.line.actualQuantity ?? '—'} (
                    {row.difference > 0 ? '+' : ''}
                    {row.difference})
                  </span>
                </div>
                <p
                  className={`text-xs ${row.hasReason ? 'text-muted-foreground' : 'text-destructive'}`}
                >
                  {row.hasReason ? `سبب الفرق: ${row.line.reason}` : 'لم يُدخل سبب الفرق بعد.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
