import { z } from 'zod'

import type {
  CreateExternalPartyRequest,
  ExternalParty,
  UpdateExternalPartyRequest,
} from '@/modules/organization/types/organization.api-types'

/**
 * Client-side shape for the ExternalParty create/update form.
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

/** The four editable text fields, shared by both commands. */
function editableFields(values: ExternalPartyFormValues) {
  return {
    nameAr: values.nameAr.trim(),
    code: emptyToNull(values.code),
    contactInfo: emptyToNull(values.contactInfo),
    notes: emptyToNull(values.notes),
  }
}

/**
 * `POST /external-parties` body: editable fields ONLY.
 *
 * No `status` and no `rowVersion` — create has no prior version to guard, and a
 * new party is Active by definition. Activation is a separate guarded command.
 */
export function toCreateExternalPartyRequest(
  values: ExternalPartyFormValues,
): CreateExternalPartyRequest {
  return editableFields(values)
}

/**
 * `PUT /external-parties/{id}` body: editable fields plus the REQUIRED
 * `expectedRowVersion`.
 *
 * The version comes from the record the edit dialog was opened with, because the
 * backend compares it against the stored column and refuses a stale value. This
 * is the only write in the module that carries one: the retired single "upsert"
 * type sent the raw `rowVersion` under the wrong key, which the
 * `additionalProperties: false` body discards and the required guard then fails
 * for being missing.
 */
export function toUpdateExternalPartyRequest(
  values: ExternalPartyFormValues,
  party: ExternalParty,
): UpdateExternalPartyRequest {
  return {
    ...editableFields(values),
    expectedRowVersion: party.rowVersion,
  }
}
