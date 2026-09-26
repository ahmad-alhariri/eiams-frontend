import { z } from 'zod'

import type { UnitOfMeasureUpsertRequest } from '@/modules/catalog/types/catalog.types'

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
  descriptionAr: z.union([z.string(), z.null()]),
  nominalConversionFactor: z
    .number({ message: 'أدخل عامل تحويل رقميًا.' })
    .positive('يجب أن يكون عامل التحويل أكبر من صفر.'),
  baseUnitId: z.union([z.string().uuid(), z.null()]),
  status: z.enum(['Active', 'Inactive']),
})

export type UnitOfMeasureFormValues = z.infer<typeof unitOfMeasureSchema>

/** Preserves the API concurrency token while normalizing user-entered text. */
export function toUnitOfMeasureRequest(
  values: UnitOfMeasureFormValues,
  unit: { readonly rowVersion: number } | null,
): UnitOfMeasureUpsertRequest {
  return {
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    descriptionAr: values.descriptionAr,
    nominalConversionFactor: values.nominalConversionFactor,
    baseUnitId: values.baseUnitId,
    status: values.status,
    rowVersion: unit?.rowVersion ?? 0,
  }
}
