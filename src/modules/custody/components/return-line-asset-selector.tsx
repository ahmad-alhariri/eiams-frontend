import { useFormContext, useWatch } from 'react-hook-form'

import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import type { DocumentLinesContainer } from '@/shared/documents/schemas/document-lines.schemas'
import { cn } from '@/shared/utils/class-names'
import { formatNumber } from '@/shared/utils/format'

export interface ReturnLineAssetSelectorProps {
  index: number
  /** The selected original Issue document id (undefined = none chosen yet). */
  originalIssueDocumentId: string | undefined
  /** Server-authoritative eligible subjects of the selected original Issue. */
  items: readonly ReturnEligibleItem[]
  isLoading: boolean
  disabled?: boolean
}

/** A serial-tracked durable unit always carries the serial the server matches on. */
function isSerialUnit(
  item: ReturnEligibleItem,
): item is ReturnEligibleItem & { serialNumber: string } {
  return (
    item.subjectType === 'TrackedUnit' && item.serialNumber !== null && item.serialNumber !== ''
  )
}

/**
 * Per-line returnable-subject picker for Return lines (FIX-R2 + o098.5).
 * Renders inside the shared editor's `assetSlotForLine` slot. The candidates
 * are the server-authoritative rows of `GET /returns/eligible-items` for the
 * selected original Issue — every one of them is still in custody of that
 * Issue, which is exactly what the server re-verified on post. The page owns
 * the query and passes the rows down, so the picker never fetches per line.
 *
 * - `Asset` lines: select every asset being returned; selection count must
 *   equal the line quantity (the backend truncates and rejects otherwise).
 * - Durable `Quantity` lines: show the remaining custody and let the line's
 *   own quantity carry a partial amount; the page gate caps it at
 *   `availableQuantity`.
 * - Durable `Serial` lines: pick exactly ONE unit; its serial travels on the
 *   line's `batchNumber` (the field the server matches `SerialNumber` on) and
 *   the quantity is pinned to 1.
 */
export function ReturnLineAssetSelector({
  index,
  originalIssueDocumentId,
  items,
  isLoading,
  disabled = false,
}: ReturnLineAssetSelectorProps) {
  const { control, setValue } = useFormContext<DocumentLinesContainer>()
  const line = (useWatch({ control, name: `lines.${index}` }) ?? {}) as Partial<
    DocumentLinesContainer['lines'][number]
  >
  const materialId = line.materialId ?? ''
  const isAssetKind = line.materialKind === 'Asset'
  const isDurableKind = line.materialKind === 'Durable'
  const selectedAssets = line.assetIds ?? []
  const quantity = typeof line.quantity === 'number' ? line.quantity : 0
  const selectedSerial = (line.batchNumber ?? '').trim()

  if (materialId === '' || (!isAssetKind && !isDurableKind)) {
    return null
  }

  if (originalIssueDocumentId === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        {isAssetKind
          ? 'اختر سند الصرف الأصلي أولاً لعرض الأصول المستردة ضمن هذا البند.'
          : 'اختر سند الصرف الأصلي أولاً لعرض العهدة المتبقية ضمن هذا البند.'}
      </p>
    )
  }

  const ownItems = items.filter((item) => item.materialId === materialId)

  if (isAssetKind) {
    const options = ownItems.filter((item) => item.subjectType === 'Asset')

    const toggle = (subjectId: string, checked: boolean) => {
      const next = checked
        ? [...selectedAssets, subjectId]
        : selectedAssets.filter((id) => id !== subjectId)
      setValue(`lines.${index}.assetIds`, next, { shouldValidate: false })
    }

    const countMismatch = selectedAssets.length !== quantity
    const quantityNotWhole = !Number.isInteger(quantity) || quantity <= 0

    return (
      <div
        data-slot="return-line-asset-selector"
        className="grid gap-2 rounded-md border border-dashed border-border p-3"
      >
        <span className="text-sm font-medium text-foreground">
          الأصول المستردة للبند: {selectedAssets.length} من {quantity} (يجب أن يساوي المحدد الكمية)
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
              const checked = selectedAssets.includes(item.subjectId)
              const chipLabel = item.assetNumber ?? item.serialNumber ?? item.subjectId
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
            المحدد {selectedAssets.length} من {quantity} — يجب أن يساوي عدد الأصول المحددة الكمية.
          </p>
        ) : null}
      </div>
    )
  }

  // Durable custody: one row per material, either a quantity allocation or the
  // serial-tracked units still issued on the original issue.
  const quantityItem = ownItems.find((item) => item.subjectType === 'MaterialQuantity')
  const unitItems = ownItems.filter(isSerialUnit)
  const exceedsAvailable = quantityItem !== undefined && quantity > quantityItem.availableQuantity
  const selectedSerialKnown = unitItems.some((item) => item.serialNumber === selectedSerial)

  return (
    <div
      data-slot="return-line-asset-selector"
      className="grid gap-2 rounded-md border border-dashed border-border p-3"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          جارٍ تحميل العهدة المتبقية من سند الصرف الأصلي...
        </p>
      ) : quantityItem === undefined && unitItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد عهدة متبقية قابلة للإرجاع لهذه المادة في سند الصرف الأصلي.
        </p>
      ) : null}

      {!isLoading && quantityItem !== undefined ? (
        <>
          <span className="text-sm font-medium text-foreground">
            الكمية المتبقية في العهدة: {formatNumber(quantityItem.availableQuantity)} من{' '}
            {formatNumber(quantityItem.issuedQuantity)}
          </span>
          {exceedsAvailable ? (
            <p role="alert" className="text-sm text-destructive">
              الكمية المطلوبة تتجاوز الكمية المتبقية في العهدة (
              {formatNumber(quantityItem.availableQuantity)}).
            </p>
          ) : null}
        </>
      ) : null}

      {!isLoading && unitItems.length > 0 ? (
        <>
          <span className="text-sm font-medium text-foreground">
            وحدات العهدة التسلسلية المتاحة: {unitItems.length} (اختر وحدة واحدة)
          </span>
          <div className="flex flex-wrap gap-2">
            {unitItems.map((item) => {
              const checked = item.serialNumber === selectedSerial
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
                    type="radio"
                    name={`return-line-${index}-serial`}
                    className="accent-primary"
                    aria-label={`${item.serialNumber} — ${item.materialNameAr}`}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      setValue(`lines.${index}.batchNumber`, item.serialNumber, {
                        shouldValidate: true,
                      })
                      // The server resolves ONE unit per line; a quantity other
                      // than 1 would post a movement for more than the unit.
                      setValue(`lines.${index}.quantity`, 1, { shouldValidate: true })
                    }}
                  />
                  <span dir="ltr" className="font-mono text-xs">
                    {item.serialNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.materialNameAr}</span>
                </label>
              )
            })}
          </div>
          {selectedSerial === '' || !selectedSerialKnown ? (
            <p className="text-sm text-muted-foreground">
              اختر الرقم التسلسلي للوحدة التي ستعود إلى المستودع.
            </p>
          ) : quantity !== 1 ? (
            <p role="alert" className="text-sm text-destructive">
              يجب أن تكون كمية الوحدة التسلسلية 1.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
