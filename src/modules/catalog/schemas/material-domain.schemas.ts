import { z } from 'zod'

import type {
  CreateMaterialDomainRequest,
  UpdateMaterialDomainRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * The fields a catalog manager may set on a material domain.
 *
 * `status` is NOT one of them: a new domain is Active by definition, and status
 * afterwards is a separate guarded command (`PUT
 * /catalog/domains/{materialDomainId}/status`) that binds an INTEGER ordinal,
 * not this string. A domain row's status therefore lives on the screen, not in
 * this schema.
 */
export const materialDomainSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'رمز المجال مطلوب.')
    .max(50, 'لا يمكن أن يتجاوز رمز المجال 50 حرفاً.'),
  name: z
    .string()
    .trim()
    .min(1, 'اسم المجال مطلوب.')
    .max(200, 'لا يمكن أن يتجاوز اسم المجال 200 حرف.'),
})

export type MaterialDomainFormValues = z.infer<typeof materialDomainSchema>

/** `POST /catalog/domains` body — name and code, no status, no version. */
export function toCreateMaterialDomainRequest(
  values: MaterialDomainFormValues,
): CreateMaterialDomainRequest {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
  }
}

/**
 * `PUT /catalog/domains/{materialDomainId}` body — `name` ONLY.
 *
 * `code` is deliberately dropped: the update record binds `Name` alone, so a
 * code rename is not expressible through this API and belongs on create. There
 * is also no `existing` parameter to take, because MaterialDomain is not a
 * versioned aggregate and carries no concurrency token.
 */
export function toUpdateMaterialDomainRequest(
  values: MaterialDomainFormValues,
): UpdateMaterialDomainRequest {
  return {
    name: values.name.trim(),
  }
}
