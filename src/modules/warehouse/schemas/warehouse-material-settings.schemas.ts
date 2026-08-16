import { z } from 'zod'

import type {
  WarehouseMaterialSetting,
  WarehouseMaterialSettingUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * Non-negative DECIMAL(18,3) threshold kept as source text (like the
 * conversion-factor convention): JavaScript numbers round valid values near
 * the contract limit, and the server remains the final validator.
 */
const NON_NEGATIVE_DECIMAL_18_3 = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/

function thresholdMessage(label: string): string {
  return `أدخل ${label} رقمًا غير سالب بصيغة عشرية صحيحة (حتى 3 منازل عشرية).`
}

const optionalThreshold = (label: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value === '' || NON_NEGATIVE_DECIMAL_18_3.test(value),
      thresholdMessage(label),
    )

/** Form mirror of WarehouseMaterialSettingUpsertRequest with text thresholds. */
export const warehouseMaterialSettingSchema = z
  .object({
    materialId: z.string().uuid('اختر مادة صالحة.'),
    minQuantity: optionalThreshold('الحد الأدنى'),
    maxQuantity: optionalThreshold('الحد الأعلى'),
    status: z.enum(['Active', 'Inactive']),
  })
  .refine(
    (values) => {
      if (values.minQuantity === undefined || values.minQuantity === '') return true
      if (values.maxQuantity === undefined || values.maxQuantity === '') return true
      return Number(values.maxQuantity) >= Number(values.minQuantity)
    },
    {
      message: 'الحد الأعلى يجب أن يكون أكبر من الحد الأدنى أو مساويًا له.',
      path: ['maxQuantity'],
    },
  )

export type WarehouseMaterialSettingFormValues = z.infer<typeof warehouseMaterialSettingSchema>

function toNullableQuantity(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  return Number(value)
}

/** Maps form-owned values to the exact contract request, including concurrency. */
export function toWarehouseMaterialSettingRequest(
  values: WarehouseMaterialSettingFormValues,
  existing: WarehouseMaterialSetting | null,
): WarehouseMaterialSettingUpsertRequest {
  return {
    materialId: values.materialId,
    minQuantity: toNullableQuantity(values.minQuantity),
    maxQuantity: toNullableQuantity(values.maxQuantity),
    rowVersion: existing?.rowVersion ?? 0,
    status: values.status,
  }
}
