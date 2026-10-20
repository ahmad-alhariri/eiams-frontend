import { useFormContext, useWatch } from 'react-hook-form'

import { useReturnEligibleItems } from '@/modules/custody/hooks/use-return-eligible-items'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import type { DocumentLinesContainer } from '@/shared/documents/schemas/document-lines.schemas'
import { cn } from '@/shared/utils/class-names'

export interface ReturnLineAssetSelectorProps {
  index: number
  /** The selected original Issue document id (undefined = none chosen yet). */
  originalIssueDocumentId: string | undefined
  disabled?: boolean
}

/**
 * Per-line existing-asset selector for Asset-kind Return lines (FIX-R2).
 * Renders inside the shared editor's `assetSlotForLine` slot. The candidates
 * are the server-authoritative `Asset` rows of `GET /returns/eligible-items`
 * for the selected original Issue — every one of which carries an ACTIVE
 * custody row of that Issue, which is exactly what the server re-verified on
 * post. Selection count must equal the line quantity (and the quantity must
 * be a whole number, because the backend truncates and rejects otherwise):
 * the mismatch alert renders here and the page gate blocks the same state.
 */
export function ReturnLineAssetSelector({
  index,
  originalIssueDocumentId,
  disabled = false,
}: ReturnLineAssetSelectorProps) {
  const { control, setValue } = useFormContext<DocumentLinesContainer>()
  const line = (useWatch({ control, name: `lines.${index}` }) ?? {}) as Partial<
    DocumentLinesContainer['lines'][number]
  >
  const materialId = line.materialId ?? ''
  const isAssetKind = line.materialKind === 'Asset'
  const selected = line.assetIds ?? []

  // The hook is enabled only for a real issue id; an empty id never reaches
  // the server.
  const { items, isLoading } = useReturnEligibleItems(originalIssueDocumentId)

  if (!isAssetKind || materialId === '') {
    return null
  }

  if (originalIssueDocumentId === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        اختر سند الصرف الأصلي أولاً لعرض الأصول المستردة ضمن هذا البند.
      </p>
    )
  }

  const options = items.filter(
    (item: ReturnEligibleItem) => item.subjectType === 'Asset' && item.materialId === materialId,
  )

  const toggle = (subjectId: string, checked: boolean) => {
    const next = checked ? [...selected, subjectId] : selected.filter((id) => id !== subjectId)
    setValue(`lines.${index}.assetIds`, next, { shouldValidate: false })
  }

  const quantity = typeof line.quantity === 'number' ? line.quantity : 0
  const countMismatch = selected.length !== quantity
  const quantityNotWhole = !Number.isInteger(quantity) || quantity <= 0

  return (
    <div
      data-slot="return-line-asset-selector"
      className="grid gap-2 rounded-md border border-dashed border-border p-3"
    >
      <span className="text-sm font-medium text-foreground">
        الأصول المستردة للبند: {selected.length} من {quantity} (يجب أن يساوي المحدد الكمية)
      </span>
      {isLoading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          جارٍ تحميل الأصول المستردة من سند الصرف الأصلي...
        </p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أصول مستردة مطابقة لهذه المادة في سند الصرف الأصلي.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((item) => {
            const checked = selected.includes(item.subjectId)
            const chipLabel =
              item.assetNumber ??
              item.serialNumber ??
              item.subjectId
            return (
              <label
                key={item.subjectId}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm',
                  checked && 'border-primary bg-primary/10',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  aria-label={`${chipLabel} — ${item.materialNameAr}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(item.subjectId, event.target.checked)}
                />
                <span dir="ltr" className="font-mono text-xs">
                  {item.assetNumber}
                  {item.serialNumber !== null ? ` (${item.serialNumber})` : ''}
                </span>
                <span className="text-xs text-muted-foreground">{item.materialNameAr}</span>
              </label>
            )
          })}
        </div>
      )}
      {quantityNotWhole ? (
        <p role="alert" className="text-sm text-destructive">
          يجب أن تكون كمية بند الأصل رقماً صحيحاً (وحدة لكل أصل).
        </p>
      ) : !isLoading && countMismatch ? (
        <p role="alert" className="text-sm text-destructive">
          المحدد {selected.length} من {quantity} — يجب أن يساوي عدد الأصول المحددة الكمية.
        </p>
      ) : null}
    </div>
  )
}
