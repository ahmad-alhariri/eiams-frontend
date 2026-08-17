import { z } from 'zod'

import type { ExternalParty, ExternalPartyUpsertRequest } from '@/shared/types/generated/eiams-v1'

/**
 * Client-side shape for the contract-backed ExternalParty upsert request.
 * Optional text is normalized at the boundary so the API receives null rather
 * than whitespace-only values.
 */
export const externalPartySchema = z.object({
  code: z.string().trim().max(50, 'الرمز يجب ألا يتجاوز 50 محرفاً.').optional(),
  contactInfo: z.string().trim().max(500, 'معلومات الاتصال يجب ألا تتجاوز 500 محرف.').optional(),
  nameAr: z
    .string()
    .trim()
    .min(2, 'اسم الجهة يجب أن يتكون من حرفين على الأقل.')
    .max(250, 'اسم الجهة يجب ألا يتجاوز 250 محرف.'),
  notes: z.string().trim().max(1000, 'الملاحظات يجب ألا تتجاوز 1000 محرف.').optional(),
})

export type ExternalPartyFormValues = z.infer<typeof externalPartySchema>

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

export function toExternalPartyRequest(
  values: ExternalPartyFormValues,
  party: ExternalParty | null,
): ExternalPartyUpsertRequest {
  return {
    nameAr: values.nameAr.trim(),
    code: emptyToNull(values.code),
    contactInfo: emptyToNull(values.contactInfo),
    notes: emptyToNull(values.notes),
    rowVersion: party?.rowVersion ?? 0,
    status: party?.status ?? 'Active',
  }
}
