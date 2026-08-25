import { useMemo, useState } from 'react'

import {
  useCountLinesQuery as useCountLines,
  useUpdateCountLinesMutation,
} from '@/modules/inventory-count/hooks/use-count-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

interface LineDraft {
  actualQuantity: string
  reason: string
}

/**
 * Quantity-entry workspace (e20-t06). Operators record the `actualQuantity`
 * counted for each line; the difference vs. the captured snapshot (book)
 * quantity is computed live. The save is batched (PUT
 * `updateInventoryCountLines`) and only sends lines whose value changed, so a
 * partial count can be persisted and resumed. Variance reasons are captured
 * per line (PRD §12.7 — required before completion, surfaced in t07).
 */
export function CountQuantityWorkspace({
  countId,
  countRowVersion,
}: {
  countId: string
  countRowVersion: number
}) {
  const can = usePermission()
  const canEnter = can.has('count.enter')
  const linesQuery = useCountLines(countId, { pageIndex: 0, pageSize: 200 })
  const updateMutation = useUpdateCountLinesMutation(countId)

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({})

  const lines = linesQuery.data?.items ?? []
  const items = lines as readonly InventoryCountLine[]

  const setDraft = (lineId: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [lineId]: { actualQuantity: '', reason: '', ...prev[lineId], ...patch },
    }))
  }

  const draftFor = (line: InventoryCountLine): LineDraft => ({
    actualQuantity: drafts[line.countLineId]?.actualQuantity ?? String(line.actualQuantity ?? ''),
    reason:
      drafts[line.countLineId]?.reason ??
      (line.actualQuantity !== null && line.actualQuantity !== line.snapshotQuantity
        ? (line.reason ?? '')
        : ''),
  })

  const isDirty = (line: InventoryCountLine, draft: LineDraft): boolean => {
    const base = line.actualQuantity === null ? '' : String(line.actualQuantity)
    const baseReason =
      line.actualQuantity !== null && line.actualQuantity !== line.snapshotQuantity
        ? (line.reason ?? '')
        : ''
    return draft.actualQuantity !== base || draft.reason !== baseReason
  }

  const { varianceCount, totalVariance, countedCount } = useMemo(() => {
    let variance = 0
    let totalDiff = 0
    let counted = 0
    for (const line of items) {
      const draft = draftFor(line)
      const entered = draft.actualQuantity.trim() === '' ? null : Number(draft.actualQuantity)
      if (entered !== null) {
        counted += 1
        const diff = entered - line.snapshotQuantity
        totalDiff += diff
        if (diff !== 0) variance += 1
      }
    }
    return { varianceCount: variance, totalVariance: totalDiff, countedCount: counted }
  }, [items, drafts])

  const dirtyLines = items
    .map((line) => ({ line, draft: draftFor(line) }))
    .filter(({ line, draft }) => isDirty(line, draft))
    .filter(
      ({ draft }) =>
        draft.actualQuantity.trim() !== '' && Number.isFinite(Number(draft.actualQuantity)),
    )

  const handleSave = () => {
    updateMutation.mutate({
      countRowVersion,
      lines: dirtyLines.map(({ line, draft }) => ({
        countLineId: line.countLineId,
        actualQuantity: Number(draft.actualQuantity),
        rowVersion: countRowVersion,
        ...(draft.reason.trim() !== '' ? { reason: draft.reason.trim() } : {}),
      })),
    })
  }

  if (linesQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل بنود الجرد..." />
  }
  if (linesQuery.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل بنود الجرد"
        description="تعذّر جلب بنود هذه الجلسة. حاول مرة أخرى."
        action={
          <Button variant="outline" onClick={() => void linesQuery.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  return (
    <div dir="rtl" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm">
        <span>
          إجمالي البنود: <strong className="text-foreground">{items.length}</strong>
        </span>
        <span>
          أُدخلت: <strong className="text-foreground">{countedCount}</strong>
        </span>
        <span>
          ذات فرق: <strong className="text-foreground">{varianceCount}</strong>
        </span>
        <span>
          إجمالي الفرق: <strong className="text-foreground">{totalVariance}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">المادة</th>
              <th className="px-3 py-2 text-start font-medium">الكمية الدفترية</th>
              <th className="px-3 py-2 text-start font-medium">الكمية الفعلية</th>
              <th className="px-3 py-2 text-start font-medium">الفرق</th>
              <th className="px-3 py-2 text-start font-medium">سبب الفرق</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line) => {
              const draft = draftFor(line)
              const entered =
                draft.actualQuantity.trim() === '' ? null : Number(draft.actualQuantity)
              const diff = entered === null ? null : entered - line.snapshotQuantity
              const hasVariance = diff !== null && diff !== 0
              return (
                <tr key={line.countLineId} className="border-t border-border">
                  <td className="px-3 py-2">{line.material.displayName}</td>
                  <td className="px-3 py-2 ltr">{line.snapshotQuantity}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`الكمية الفعلية لـ ${line.material.displayName}`}
                      value={draft.actualQuantity}
                      disabled={!canEnter || updateMutation.isPending}
                      onChange={(event) =>
                        setDraft(line.countLineId, { actualQuantity: event.target.value })
                      }
                      className="w-32"
                    />
                  </td>
                  <td className={`px-3 py-2 ltr ${hasVariance ? 'text-destructive' : ''}`}>
                    {diff === null ? '—' : diff}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="text"
                      aria-label={`سبب الفرق لـ ${line.material.displayName}`}
                      placeholder={hasVariance ? 'سبب الفرق' : '—'}
                      value={draft.reason}
                      disabled={!canEnter || updateMutation.isPending}
                      onChange={(event) =>
                        setDraft(line.countLineId, { reason: event.target.value })
                      }
                      className="w-48"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canEnter ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void handleSave()}
            disabled={updateMutation.isPending || dirtyLines.length === 0}
          >
            {updateMutation.isPending ? 'جارٍ الحفظ...' : `حفظ (${dirtyLines.length})`}
          </Button>
          {dirtyLines.length === 0 ? (
            <span className="text-sm text-muted-foreground">لا تغييرات غير محفوظة.</span>
          ) : null}
          {updateMutation.error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              تعذّر حفظ بنود الجرد. تحقق من عدم وجود جلسة أخرى أو حدّث الصفحة.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
