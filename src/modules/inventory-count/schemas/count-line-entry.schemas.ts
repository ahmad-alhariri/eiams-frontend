import { z } from 'zod'

import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import type { UpdateCountLinesRequest } from '@/modules/inventory-count/types/inventory-count.types'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/**
 * Form schema for the count quantity-entry workspace (hbfu).
 *
 * The operator records `actualQuantity` per line and, when it differs from
 * the captured `snapshotQuantity`, a variance `reason` (PRD §12.6 step 4 —
 * a reason is required before the session can be completed). The shape mirrors
 * `UpdateCountLineInput` exactly; nothing here invents a wire field.
 *
 * Only the CURRENT server page is held in the form: the workspace paginates
 * server-side, so drafts are per-page and page navigation is guarded by an
 * explicit discard confirmation (`count-quantity-workspace.tsx`).
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
 * The form deliberately does NOT require a reason on a variance line: PRD
 * §12.6 collects the counted quantity while entering (step 4) and demands the
 * per-variance reason at review/complete (step 5). Refusing to save a count
 * because its reason is still blank would block recording, so that rule lives
 * in the variance review's completion gate, not here.
 */
export const countLineEntrySchema = z.object({
  lines: z.array(countLineDraftSchema),
})

export type CountLineEntryFormValues = z.infer<typeof countLineEntrySchema>

/** The row's server state as an editable draft baseline. */
export function toCountLineDraftValues(line: InventoryCountLine): CountLineDraftValues {
  const actualQuantity = line.actualQuantity
  const hasVariance =
    actualQuantity !== null &&
    actualQuantity !== undefined &&
    actualQuantity !== line.snapshotQuantity
  return {
    actualQuantity:
      actualQuantity === null || actualQuantity === undefined ? '' : String(actualQuantity),
    reason: hasVariance ? (line.reason ?? '') : '',
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
 * a reason typed against a matching quantity still counts as a change so it
 * is not silently dropped on save.
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
 * Why a row the operator changed cannot be sent in this save.
 *
 * Both cases used to fail silently, in a single `toCountLineUpdateRequest`
 * projection that this function replaces. A blank or unparseable quantity was
 * `flatMap`-ed away while still counting toward `dirtyCount`, so a page could
 * report a successful save and then go on claiming unsaved changes. A line with
 * no server-supplied `rowVersion` was sent as `0`, and
 * `UpdateCountLineInput.rowVersion` declares `"minimum": 1` — a payload the
 * contract guarantees it will reject with 422.
 */
export type CountLineSaveBlock =
  /** The quantity is blank or not a valid decimal, so there is no actual to record. */
  | { readonly index: number; readonly kind: 'no-quantity' }
  /** The server supplied no `rowVersion` for this line, so a versioned update cannot be built. */
  | { readonly index: number; readonly kind: 'missing-row-version' }

export interface CountLineSavePlan {
  /** The batch to send. May be empty when every changed row is blocked. */
  readonly request: UpdateCountLinesRequest
  /** Rows the operator changed that this save cannot carry, in row order. */
  readonly blocked: readonly CountLineSaveBlock[]
}

/**
 * Plans the batched `updateInventoryCountLines` payload for the current page,
 * and reports the changed rows it cannot carry.
 *
 * Only rows the operator actually changed are considered, so a partially
 * entered page stays savable and resumable. A changed row that cannot be sent
 * is **reported rather than dropped**: the caller can then tell the operator
 * that their change did not travel, instead of the page silently disagreeing
 * with itself.
 *
 * The batch and the block list are produced together on purpose — "which rows
 * are in this save" and "which changed rows are not" must never disagree, and a
 * separate projection for each is how they did.
 */
export function planCountLineSaves(
  countRowVersion: number,
  lines: readonly InventoryCountLine[],
  values: CountLineEntryFormValues,
): CountLineSavePlan {
  const payload: NonNullable<UpdateCountLinesRequest['lines']>[number][] = []
  const blocked: CountLineSaveBlock[] = []

  for (const index of countDirtyLineIndexes(lines, values.lines)) {
    const line = lines[index]
    const draft = values.lines[index]
    if (line === undefined || draft === undefined) {
      continue
    }
    const entered = parseActualQuantity(draft.actualQuantity)
    if (entered.status !== 'counted') {
      blocked.push({ index, kind: 'no-quantity' })
      continue
    }
    // `InventoryCountLine.rowVersion` is optional in the contract, and
    // `UpdateCountLineInput.rowVersion` has `"minimum": 1`. Sending the previous
    // `?? 0` fallback therefore built a request that could only ever 422.
    if (line.rowVersion === undefined) {
      blocked.push({ index, kind: 'missing-row-version' })
      continue
    }
    const reason = draft.reason.trim()
    payload.push({
      countLineId: line.countLineId,
      actualQuantity: entered.value,
      rowVersion: line.rowVersion,
      ...(reason === '' ? {} : { reason }),
    })
  }

  return { request: { countRowVersion, lines: payload }, blocked }
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
