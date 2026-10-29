import { useFormContext, useWatch } from 'react-hook-form'

import { useIssueLineAssetOptions } from '@/modules/issue/hooks/use-issue-line-asset-options'
import { assetChipLabel } from '@/modules/issue/utils/asset-selector-labels'
import type { DocumentLinesContainer } from '@/shared/documents/schemas/document-lines.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

export interface IssueLineAssetSelectorProps {
  index: number
  warehouseId: string | undefined
  disabled?: boolean
}

/**
 * Per-line existing-asset selector for Asset-kind Issue lines (D-IAR-01,
 * bead e16-t05). Renders inside the shared editor's `assetSlotForLine` slot:
 * a checkbox chip per InStock asset of the line's material at the source
 * warehouse. Selection count must equal the line quantity before save — the
 * mismatch message renders here and the page gate consumes the same state.
 */
export function IssueLineAssetSelector({
  index,
  warehouseId,
  disabled = false,
}: IssueLineAssetSelectorProps) {
  const { control, setValue } = useFormContext<DocumentLinesContainer>()
  const line = (useWatch({ control, name: `lines.${index}` }) ?? {}) as Partial<
    DocumentLinesContainer['lines'][number]
  >
  const materialId = line.materialId ?? ''
  const isAssetKind = line.materialKind === 'Asset'
  const selected = line.assetIds ?? []

  const { assets, isLoading, isError, retry } = useIssueLineAssetOptions(
    warehouseId,
    materialId || undefined,
  )

  if (!isAssetKind || materialId === '') {
    return null
  }

  const toggle = (assetId: string, checked: boolean) => {
    const next = checked ? [...selected, assetId] : selected.filter((id) => id !== assetId)
    setValue(`lines.${index}.assetIds`, next, { shouldValidate: false })
  }

  const quantity = typeof line.quantity === 'number' ? line.quantity : 0
  const countMismatch = selected.length !== quantity

  return (
    <div
      data-slot="issue-line-asset-selector"
      className="grid gap-2 rounded-md border border-dashed border-border p-3"
    >
      <span className="text-sm font-medium text-foreground">
        الأصول المحددة للبند: {selected.length} من {quantity} (يجب أن يساوي المحدد الكمية)
      </span>
      {isError ? (
        // The assets read is a SECONDARY read: the line itself is already
        // chosen, and the assets only supply the rows the user picks from. It
        // used to be collapsed into an empty list, so a FAILED read rendered
        // exactly like "this material has no asset in this warehouse" — a
        // false statement about stock the server never answered, with no
        // Arabic reason and no retry. A failed read must stay DISTINGUISHABLE
        // from an empty one, so the failure gets its OWN surface and no chip
        // is offered: picking from a list that never arrived would be a guess.
        <ErrorState
          className="min-h-32"
          title="تعذّر تحميل الأصول المتاحة"
          description="تعذّر جلب الأصول المتاحة لهذه المادة في المستودع، فلا يمكن اختيار الأصول. حاول مرة أخرى."
          action={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          جارٍ تحميل الأصول المتاحة...
        </p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد أصول متاحة لهذه المادة في المستودع.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assets.map((asset) => {
            const checked = selected.includes(asset.id)
            return (
              <label
                key={asset.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm',
                  checked && 'border-primary bg-primary/10',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  aria-label={assetChipLabel(asset)}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(asset.id, event.target.checked)}
                />
                <span dir="ltr" className="font-mono text-xs">
                  {asset.assetNumber}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {!isLoading && !isError && assets.length > 0 && countMismatch ? (
        <p role="alert" className="text-sm text-destructive">
          المحدد {selected.length} من {quantity} — يجب أن يساوي عدد الأصول المحددة الكمية.
        </p>
      ) : null}
    </div>
  )
}
