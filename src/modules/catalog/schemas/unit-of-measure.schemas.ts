import { z } from 'zod'

import type { UnitOfMeasure, UnitOfMeasureUpsertRequest } from '@/shared/types/generated/eiams-v1'

/** Fields a catalog manager may set for a contract-backed unit of measure. */
export const unitOfMeasureSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'رمز وحدة القياس مطلوب.')
    .max(50, 'رمز وحدة القياس يجب ألّا يتجاوز 50 محرفاً.'),
  nameAr: z
    .string()
    .trim()
    .min(1, 'اسم وحدة القياس مطلوب.')
    .max(200, 'اسم وحدة القياس يجب ألّا يتجاوز 200 محرف.'),
  symbolAr: z
    .string()
    .trim()
    .min(1, 'رمز العرض مطلوب.')
    .max(50, 'رمز العرض يجب ألّا يتجاوز 50 محرفاً.'),
  status: z.enum(['Active', 'Inactive']),
})

export type UnitOfMeasureFormValues = z.infer<typeof unitOfMeasureSchema>

/** Preserves the API concurrency token while normalizing user-entered text. */
export function toUnitOfMeasureRequest(
  values: UnitOfMeasureFormValues,
  unit: UnitOfMeasure | null,
): UnitOfMeasureUpsertRequest {
  return {
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    symbolAr: values.symbolAr.trim(),
    status: values.status,
    rowVersion: unit?.rowVersion ?? 0,
  }
}
