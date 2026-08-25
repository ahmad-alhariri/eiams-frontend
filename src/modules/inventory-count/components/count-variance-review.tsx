import { useMemo } from 'react'

import { useCountLinesQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'

interface VarianceRow {
  line: InventoryCountLine
  difference: number
  hasReason: boolean
}

/**
 * Variance review (e20-t07). Read-only split of the lines into matching vs.
 * differing (variance) buckets, with the captured reason surfaced per variance
 * line. The "complete" gate (enforced server-side too) requires every line
 * whose difference ≠ 0 to carry a reason — the UI blocks the complete action
 * and lists the offending lines otherwise.
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
  const linesQuery = useCountLinesQuery(countId, { pageIndex: 0, pageSize: 200 })
  const items = (linesQuery.data?.items ?? []) as readonly InventoryCountLine[]

  const { matching, variance, missingReason } = useMemo(() => {
    const rows: VarianceRow[] = items.map((line) => {
      const actual = line.actualQuantity
      const difference =
        actual === null || actual === undefined
          ? -line.snapshotQuantity
          : actual - line.snapshotQuantity
      return { line, difference, hasReason: (line.reason ?? '').trim() !== '' }
    })
    const varianceRows = rows.filter((row) => row.difference !== 0)
    return {
      matching: rows.filter((row) => row.difference === 0),
      variance: varianceRows,
      missingReason: varianceRows.filter((row) => !row.hasReason),
    }
  }, [items])

  if (linesQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل بنود الفروقات..." />
  }
  if (linesQuery.isError) {
    return <ErrorState title="تعذّر تحميل بنود الفروقات" description="حاول مرة أخرى." />
  }

  const completeBlocked = missingReason.length > 0
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
          دون سبب: <strong className="text-destructive">{missingReason.length}</strong>
        </span>
      </div>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium text-foreground">بنود مطابقة</h3>
        {matching.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بنود مطابقة.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {matching.map((row) => (
              <li
                key={row.line.countLineId}
                className="flex items-center justify-between px-3 py-2 text-sm"
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
                <div className="flex items-center justify-between text-sm">
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

      {can.has('count.complete') ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onComplete}
            disabled={!canTriggerComplete}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isCompleting ? 'جارٍ الإكمال...' : 'إكمال الجلسة'}
          </button>
          {completeBlocked ? (
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
          <button
            type="button"
            onClick={onClose}
            disabled={isClosing}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            {isClosing ? 'جارٍ الإغلاق...' : 'إغلاق الجلسة'}
          </button>
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
