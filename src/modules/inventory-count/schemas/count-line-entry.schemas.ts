import { z } from 'zod'

import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import type {
  InventoryCountLine,
  UpdateCountLinesRequest,
} from '@/modules/inventory-count/types/inventory-count.types'

/**
 * Form schema for the count quantity-entry workspace (hbfu).
 *
 * The operator records `actualQuantity` per line and, when it differs from the
 * captured `snapshotQuantity`, a variance `reason`. ONLY the CURRENT server
 * page is held in the form: the workspace paginates server-side, so drafts are
 * per-page and page navigation is guarded by an explicit discard confirmation
 * (`count-quantity-workspace.tsx`).
 */

/** Decimal grammar for an operator-entered quantity: unsigned, finite, no exponent. */
const ACTUAL_QUANTITY_PATTERN = /^\d+(?:\.\d+)?$/u

export const ACTUAL_QUANTITY_MAX = 999_999_999.999

/**
 * Single source of truth for the operator-entry grammar. The Zod refine and
 * the live difference preview both call this so the table can never show a
 * value the save path would reject (and vice versa).
 */
export function isValidActualQuantityInput(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '' || !ACTUAL_QUANTITY_PATTERN.test(trimmed)) {
    return false
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed <= ACTUAL_QUANTITY_MAX
}

export type ParsedActualQuantity =
  /** Nothing entered yet — the line is still uncounted. */
  | { readonly status: 'empty' }
  /** Entered, but not a usable non-negative decimal. */
  | { readonly status: 'invalid' }
  /** A counted quantity that the save path will accept. */
  | { readonly status: 'counted'; readonly value: number }

/** Classifies one operator entry without throwing. */
export function parseActualQuantity(value: string): ParsedActualQuantity {
  const trimmed = value.trim()
  if (trimmed === '') {
    return { status: 'empty' }
  }
  if (!isValidActualQuantityInput(trimmed)) {
    return { status: 'invalid' }
  }
  return { status: 'counted', value: Number(trimmed) }
}

export const countLineDraftSchema = z.object({
  /**
   * Kept as the raw string the operator typed (an empty string means "not
   * counted yet") so partial entry is never coerced into a misleading 0.
   */
  actualQuantity: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isValidActualQuantityInput(value),
      'أدخل كمية فعلية رقمية غير سالبة.',
    ),
  reason: z.string().trim().max(200, 'يجب ألا يتجاوز سبب الفرق 200 محرف.'),
})

export type CountLineDraftValues = z.infer<typeof countLineDraftSchema>

/**
 * The form deliberately does NOT require a reason at entry time: the
 * quantity save and the variance-reason save are separate wire operations and
 * the completion gate is what enforces a reason on every variance line.
 */
export const countLineEntrySchema = z.object({
  lines: z.array(countLineDraftSchema),
})

export type CountLineEntryFormValues = z.infer<typeof countLineEntrySchema>

/** The row's server state as an editable draft baseline. */
export function toCountLineDraftValues(line: InventoryCountLine): CountLineDraftValues {
  const actualQuantity = line.actualQuantity
  return {
    actualQuantity:
      actualQuantity === null || actualQuantity === undefined ? '' : String(actualQuantity),
    reason: line.varianceReason ?? '',
  }
}

/** Seeds the form for a whole server page. */
export function toCountLineEntryFormValues(
  lines: readonly InventoryCountLine[],
): CountLineEntryFormValues {
  return { lines: lines.map(toCountLineDraftValues) }
}

/**
 * True when the operator changed a row relative to its server baseline.
 * A cleared quantity is a change (it un-counts a previously counted line), and
 * a reason typed on a row still counts as a change so it is not silently
 * dropped on save.
 */
export function isCountLineDraftDirty(
  baseline: CountLineDraftValues,
  draft: CountLineDraftValues,
): boolean {
  return (
    draft.actualQuantity.trim() !== baseline.actualQuantity.trim() ||
    draft.reason.trim() !== baseline.reason.trim()
  )
}

/** Indexes of the current page's rows the operator has actually changed. */
export function countDirtyLineIndexes(
  lines: readonly InventoryCountLine[],
  drafts: readonly (CountLineDraftValues | undefined)[],
): number[] {
  const indexes: number[] = []
  for (const [index, line] of lines.entries()) {
    const draft = drafts[index]
    if (draft === undefined) {
      continue
    }
    if (isCountLineDraftDirty(toCountLineDraftValues(line), draft)) {
      indexes.push(index)
    }
  }
  return indexes
}

/**
 * Why a row the operator changed cannot travel in a quantity batch.
 *
 * The live line DTO carries NO rowVersion and nothing else gates a quantity
 * (F2), so the only block left is an unusable quantity. A reason the operator
 * typed on a changed row is never silently dropped either: when the row is not
 * in the quantity batch (cleared or invalid quantity) but the reason changed,
 * the reason still travels on its own wire operation.
 */
export type CountLineSaveBlock =
  /** The quantity is blank or not a valid decimal, so there is no actual to record. */
  { readonly index: number; readonly kind: 'no-quantity' }

export interface CountLineReasonSave {
  /** The line id on the wire (`InventoryCountLine.id`). */
  readonly lineId: string
  readonly reason: string
}

export interface CountLineSavePlan {
  /**
   * The batch body for `PUT /inventory-counts/{countId}/actuals`. `actuals` may
   * be empty when nothing changed; `expectedRowVersion` is the COUNT's
   * aggregate version (one bump per batch).
   */
  readonly request: UpdateCountLinesRequest
  /** Reasons to persist on their own versioned endpoints, in row order. */
  readonly reasons: readonly CountLineReasonSave[]
  /** Rows the operator changed that the quantity batch cannot carry. */
  readonly blocked: readonly CountLineSaveBlock[]
}

/**
 * Plans the `PUT /inventory-counts/{countId}/actuals` payload (RESOLUTION-025)
 * plus the variance-reason saves for the current page, and reports the rows the
 * quantity batch cannot carry.
 *
 * - The wire carries `{ actuals: [{ lineId, actualQuantity }], expectedRowVersion }`
 *   (aggregate count row version only).
 * - The reason fields live IN the same form, and a reason the operator typed
 *   travels in `plan.reasons` for the caller to persist through
 *   `PUT /{countId}/lines/{lineId}/variance-reason` (count.enter). A blank
 * reason is never sent (the endpoint requires a non-blank reason); reasons
 * stay attached to the row instead of being cleared.
 */
export function planCountLineSaves(
  countRowVersion: number,
  lines: readonly InventoryCountLine[],
  values: CountLineEntryFormValues,
): CountLineSavePlan {
  const actuals: UpdateCountLinesRequest['actuals'][number][] = []
  const reasons: CountLineReasonSave[] = []
  const blocked: CountLineSaveBlock[] = []

  for (const index of countDirtyLineIndexes(lines, values.lines)) {
    const line = lines[index]
    const draft = values.lines[index]
    if (line === undefined || draft === undefined) {
      continue
    }
    const entered = parseActualQuantity(draft.actualQuantity)
    if (entered.status === 'counted') {
      actuals.push({
        lineId: line.id,
        actualQuantity: entered.value,
      })
    } else {
      blocked.push({ index, kind: 'no-quantity' })
    }
    const draftReason = draft.reason.trim()
    const serverReason = (line.varianceReason ?? '').trim()
    if (draftReason !== '' && draftReason !== serverReason) {
      reasons.push({ lineId: line.id, reason: draftReason })
    }
  }

  return {
    request: { actuals, expectedRowVersion: countRowVersion },
    reasons,
    blocked,
  }
}

/**
 * Live preview of the difference the operator is typing RIGHT NOW, for the
 * quantity-entry table's «الفرق» column.
 *
 * This previews unsaved local form input and is never a read model: a stored
 * line's difference is the server's `InventoryCountLine.difference`, and an
 * unentered line is *unentered* rather than a full shortfall (kc7v,
 * eiams-frontend-ef78). An entry that is blank or unusable previews nothing
 * rather than a fabricated number, so the table can never show a value the save
 * path would reject.
 */
export function countLineDifference(
  line: InventoryCountLine,
  actualQuantityInput: string,
): number | null {
  const entered = parseActualQuantity(actualQuantityInput)
  if (entered.status !== 'counted') {
    return null
  }
  return entered.value - line.snapshotQuantity
}

/** True when a line counts a serialized asset (present/absent) instead of a bulk quantity. */
export { isAssetCountLine }
