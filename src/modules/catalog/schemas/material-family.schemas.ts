import { z } from 'zod'

import type { MaterialFamily, MaterialFamilyUpsertRequest } from '@/shared/types/generated/eiams-v1'

/** Fields a catalog manager may set for a material family in the v1 contract. */
export const materialFamilySchema = z.object({
  categoryId: z.string().uuid('اختر تصنيفاً نشطاً للعائلة.'),
  code: z
    .string()
    .trim()
    .min(1, 'رمز عائلة المادة مطلوب.')
    .max(50, 'لا يمكن أن يتجاوز رمز عائلة المادة 50 حرفاً.'),
  nameAr: z
    .string()
    .trim()
    .min(1, 'اسم عائلة المادة مطلوب.')
    .max(200, 'لا يمكن أن يتجاوز اسم عائلة المادة 200 حرف.'),
  status: z.enum(['Active', 'Inactive']),
})

export type MaterialFamilyFormValues = z.infer<typeof materialFamilySchema>

/** Maps dialog values to the exact v1 request while retaining optimistic concurrency. */
export function toMaterialFamilyRequest(
  values: MaterialFamilyFormValues,
  family: MaterialFamily | null,
): MaterialFamilyUpsertRequest {
  return {
    categoryId: values.categoryId,
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    rowVersion: family?.rowVersion ?? 0,
    status: values.status,
  }
}
