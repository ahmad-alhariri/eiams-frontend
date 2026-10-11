import { z } from 'zod'

import type {
  CreateMaterialFamilyRequest,
  UpdateMaterialFamilyRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * Fields a catalog manager may set for a material family in the contract.
 *
 * `status` is NOT one of them: a new family is Active by definition, and status
 * is a separate guarded command whose body is an INTEGER ordinal. The category is
 * a form field even though it is not updatable, because `POST` binds it.
 */
export const materialFamilySchema = z.object({
  categoryId: z.string('اختر تصنيفاً.').uuid('اختر تصنيفاً نشطاً للعائلة.'),
  code: z
    .string()
    .trim()
    .min(1, 'رمز عائلة المادة مطلوب.')
    .max(50, 'لا يمكن أن يتجاوز رمز عائلة المادة 50 حرفاً.'),
  name: z
    .string()
    .trim()
    .min(1, 'اسم عائلة المادة مطلوب.')
    .max(200, 'لا يمكن أن يتجاوز اسم عائلة المادة 200 حرف.'),
})

export type MaterialFamilyFormValues = z.infer<typeof materialFamilySchema>

/** `POST /catalog/families` body. `categoryId` is create-only. */
export function toCreateMaterialFamilyRequest(
  values: MaterialFamilyFormValues,
): CreateMaterialFamilyRequest {
  return {
    categoryId: values.categoryId,
    name: values.name.trim(),
    code: values.code.trim(),
  }
}

/**
 * `PUT /catalog/families/{materialFamilyId}` body — `name` and `code` only.
 *
 * `categoryId` is dropped: re-categorising a family is not exposed by this
 * route. There is no `existing` parameter because MaterialFamily carries no
 * concurrency token.
 */
export function toUpdateMaterialFamilyRequest(
  values: MaterialFamilyFormValues,
): UpdateMaterialFamilyRequest {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
  }
}
