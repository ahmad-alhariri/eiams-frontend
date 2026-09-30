import { z } from 'zod'

import type {
  MaterialDomain,
  MaterialDomainUpsertRequest,
} from '@/modules/catalog/types/catalog.types'

/** The v1 contract only requires a code, Arabic display name, status, and concurrency version. */
export const materialDomainSchema = z.object({
  code: z.string().trim().min(1, 'رمز المجال مطلوب.'),
  nameAr: z.string().trim().min(1, 'اسم المجال مطلوب.'),
  status: z.enum(['Active', 'Inactive']),
})

export type MaterialDomainFormValues = z.infer<typeof materialDomainSchema>

/** Maps form values to the exact v1 payload without adding client-owned fields. */
export function toMaterialDomainRequest(
  values: MaterialDomainFormValues,
  domain: MaterialDomain | null,
): MaterialDomainUpsertRequest {
  return {
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    status: values.status,
    rowVersion: domain?.rowVersion ?? 0,
  }
}
