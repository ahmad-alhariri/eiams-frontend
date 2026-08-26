import { z } from 'zod'

import { ADJUSTMENT_PURPOSE_LABELS_AR } from '@/modules/adjustment/types/adjustment.types'
import type { InventoryAdjustmentDraftRequest } from '@/shared/types/generated/eiams-v1'

/**
 * Form schemas for the new-adjustment draft page (e21-t04), shaped exactly
 * like `InventoryAdjustmentDraftRequest` (D-ADJ-01):
 *
 * - `CountVariance` requires a count reference; the page locks both the
 *   purpose and the warehouse when launched from a count session (e21-t03).
 * - `DirectCorrection` forbids a count reference and demands a header
 *   justification plus a reason on every signed line.
 * - `Disposal` is intentionally absent here: it is a terminal single-asset
 *   flow delivered by e21-t08 through its own entry point, never composed
 *   inside this generic draft form (docs/adjustment-workflow-decision.md).
 */

/** Purposes the generic draft form offers; Disposal rides its own flow (t08). */
export const DRAFT_FORM_PURPOSES: readonly ['CountVariance', 'DirectCorrection'] = [
  'CountVariance',
  'DirectCorrection',
]

export const adjustmentHeaderSchema = z.object({
  warehouseId: z.uuid('يجب اختيار مستودع صالح من القائمة.'),
  purpose: z.enum(['CountVariance', 'DirectCorrection'], {
    message: 'يجب اختيار غرض التسوية.',
  }),
  /** Header rationale; PRD §12.7 requires a documented reason on every adjustment. */
  reason: z
    .string()
    .trim()
    .min(1, 'سبب التسوية مطلوب.')
    .max(500, 'يجب ألا يتجاوز سبب التسوية 500 محرف.'),
})

export const adjustmentLineSchema = z.object({
  /** Server-side line identity, present only when editing an existing draft. */
  adjustmentLineId: z.uuid().optional(),
  materialId: z.uuid('يجب اختيار مادة صالحة.'),
  /** Selection-time display snapshot (never sent). */
  materialNameAr: z.string().trim().min(1, 'يجب اختيار مادة صالحة.'),
  /** Signed stock difference: positive = increase, negative = decrease; never zero. */
  quantityDelta: z.coerce
    .number('يجب إدخال فرق كمية صحيح.')
    .refine((value) => value !== 0, 'لا يجوز أن يكون فرق الكمية صفراً.'),
  reason: z
    .string()
    .trim()
    .min(1, 'سبب الفرق مطلوب لكل بند.')
    .max(200, 'يجب ألا يتجاوز سبب الفرق 200 محرف.'),
})

export type AdjustmentLineValues = z.infer<typeof adjustmentLineSchema>

export function createEmptyAdjustmentLine(): AdjustmentLineValues {
  return {
    materialId: '',
    materialNameAr: '',
    quantityDelta: 0,
    reason: '',
  }
}

/**
 * The whole-form shape. Cross-purpose rules live here (not on the header
 * group) because they span sibling groups:
 * - CountVariance must carry its originating session reference;
 * - DirectCorrection must not carry one (D-ADJ-01: forbidden).
 */
export const adjustmentFormSchema = z
  .object({
    header: adjustmentHeaderSchema,
    countId: z.string().optional(),
    lines: z.array(adjustmentLineSchema).min(1, 'أضف بنداً واحداً على الأقل.'),
  })
  .refine((values) => values.header.purpose !== 'CountVariance' || (values.countId ?? '') !== '', {
    message: 'تسوية فروقات الجرد يجب أن ترتبط بجلسة جرد.',
    path: ['countId'],
  })
  .refine((values) => values.header.purpose !== 'DirectCorrection' || !values.countId, {
    message: 'التسوية المباشرة لا ترتبط بجلسة جرد.',
    path: ['countId'],
  })

export type AdjustmentHeaderValues = z.infer<typeof adjustmentHeaderSchema>
export type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>

/** Maps validated form values onto the exact contract request body. */
export function toAdjustmentDraftRequest(
  values: AdjustmentFormValues,
): InventoryAdjustmentDraftRequest {
  return {
    warehouseId: values.header.warehouseId,
    purpose: values.header.purpose,
    reason: values.header.reason,
    ...(values.header.purpose === 'CountVariance' && values.countId
      ? { countId: values.countId }
      : {}),
    lines: values.lines.map((line) => ({
      ...(line.adjustmentLineId === undefined ? {} : { adjustmentLineId: line.adjustmentLineId }),
      materialId: line.materialId,
      quantityDelta: line.quantityDelta,
      reason: line.reason,
    })),
    rowVersion: 0,
  }
}

/** Re-exported for the purpose Select options on the form page. */
export { ADJUSTMENT_PURPOSE_LABELS_AR as DRAFT_FORM_PURPOSE_LABELS_AR }

/** Query-param guard for the launch deep-link (?purpose=CountVariance). */
export function isDraftFormPurpose(
  value: string | null,
): value is 'CountVariance' | 'DirectCorrection' {
  return value === 'CountVariance' || value === 'DirectCorrection'
}
