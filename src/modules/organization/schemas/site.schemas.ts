import { z } from 'zod'

import type { Site, SiteUpsertRequest } from '@/shared/types/generated/eiams-v1'

const UUID_MESSAGE = 'يجب إدخال معرّف الجهة بصيغة صحيحة.'

/**
 * The API requires the owning organization even though sites are administered
 * from the enterprise-scoped directory. No organization lookup endpoint is
 * part of the v1 contract, so the identifier stays an explicit form field.
 */
export const siteSchema = z.object({
  organizationId: z.uuid(UUID_MESSAGE),
  code: z
    .string()
    .trim()
    .min(1, 'رمز الموقع مطلوب.')
    .max(50, 'رمز الموقع يجب ألّا يتجاوز 50 محرفًا.'),
  nameAr: z
    .string()
    .trim()
    .min(2, 'اسم الموقع يجب أن يتكون من حرفين على الأقل.')
    .max(200, 'اسم الموقع يجب ألّا يتجاوز 200 محرف.'),
  governorate: z.string().trim().max(100, 'المحافظة يجب ألّا تتجاوز 100 محرف.').optional(),
  address: z.string().trim().max(500, 'العنوان يجب ألّا يتجاوز 500 محرف.').optional(),
  status: z.enum(['Active', 'Inactive']),
})

export type SiteFormValues = z.infer<typeof siteSchema>

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/** Maps form-owned values to the exact v1 upsert request shape. */
export function toSiteRequest(values: SiteFormValues, site: Site | null): SiteUpsertRequest {
  return {
    organizationId: values.organizationId,
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    governorate: emptyToNull(values.governorate),
    address: emptyToNull(values.address),
    status: values.status,
    rowVersion: site?.rowVersion ?? 0,
  }
}
