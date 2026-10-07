import { z } from 'zod'

import type {
  Site,
  SiteCreateRequest,
  SiteUpdateRequest,
} from '@/modules/organization/types/organization.types'

const UUID_MESSAGE = 'يجب إدخال معرّف الجهة بصيغة صحيحة.'
const CODE_REQUIRED_MESSAGE = 'رمز الموقع مطلوب.'
const CODE_TOO_LONG_MESSAGE = 'رمز الموقع يجب ألّا يتجاوز 50 محرفًا.'
const NAME_REQUIRED_MESSAGE = 'اسم الموقع يجب أن يتكون من حرفين على الأقل.'
const NAME_TOO_LONG_MESSAGE = 'اسم الموقع يجب ألّا يتجاوز 200 محرف.'
const LOCATION_TOO_LONG_MESSAGE = 'العنوان يجب ألّا يتجاوز 500 محرف.'
const GOVERNORATE_TOO_LONG_MESSAGE = 'المحافظة يجب ألّا يتجاوز 100 محرف.'

/**
 * One form shape for both site operations, with the create-only fields required
 * only in create mode — the pattern `warehouse/schemas/warehouse.schemas.ts`
 * uses and the one the backend enforces: `POST /sites` binds `organizationId`
 * and `code`, `PUT /sites/{id}` binds neither.
 *
 * The wire names are the form names: `name` (not `nameAr`), `location` (the old
 * UI called it `address`), and `governorateCode` (the old UI called it
 * `governorate` and typed it as free text; the backend types it as a code).
 *
 * There is no `status` here because neither body binds it and Site has no
 * activation route in this contract — the record's status is server-owned and
 * read-only here. There is no `rowVersion` because Site is NOT a versioned
 * aggregate, so there is no ExpectedRowVersion to send.
 */
export function siteFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: shown read-only on edit and never sent to the update body.
    // No organization lookup endpoint exists in this contract, so the owning
    // organization identifier stays an explicit form field.
    organizationId: isCreate ? z.uuid(UUID_MESSAGE) : z.string(),
    code: isCreate
      ? z.string().trim().min(1, CODE_REQUIRED_MESSAGE).max(50, CODE_TOO_LONG_MESSAGE)
      : z.string().trim().max(50, CODE_TOO_LONG_MESSAGE),
    // Both bodies bind `name`, so both modes require it.
    name: z.string().trim().min(2, NAME_REQUIRED_MESSAGE).max(200, NAME_TOO_LONG_MESSAGE),
    location: z.string().trim().max(500, LOCATION_TOO_LONG_MESSAGE).optional(),
    governorateCode: z.string().trim().max(100, GOVERNORATE_TOO_LONG_MESSAGE).optional(),
  })
}

export type SiteFormValues = z.infer<ReturnType<typeof siteFormSchema>>

/** Fresh empty values for a create form (never a shared mutable object). */
export function emptySiteFormValues(): SiteFormValues {
  return {
    organizationId: '',
    code: '',
    name: '',
    location: '',
    governorateCode: '',
  }
}

/**
 * Seeds the form from a site READ record, reading `name`, `location` and
 * `governorateCode` — the fields the backend actually serves. The record has no
 * `nameAr`, no `address`, and no `rowVersion`.
 */
export function toSiteFormValues(site: Site | null): SiteFormValues {
  if (site === null) return emptySiteFormValues()
  return {
    organizationId: site.organizationId,
    code: site.code,
    name: site.name,
    location: site.location ?? '',
    governorateCode: site.governorateCode ?? '',
  }
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/**
 * Maps create values to `POST /sites`: `organizationId`, `name`, `code`,
 * `location`, `governorateCode` — and nothing else. No `status` (neither body
 * binds it) and no concurrency token (the row does not exist yet).
 */
export function toCreateSiteRequest(values: SiteFormValues): SiteCreateRequest {
  return {
    organizationId: values.organizationId,
    name: values.name.trim(),
    code: values.code.trim(),
    location: optionalText(values.location),
    governorateCode: optionalText(values.governorateCode),
  }
}

/**
 * Maps edit values to `PUT /sites/{id}`: the create-only `organizationId` and
 * `code` are dropped because the body binds neither, and `status` is dropped
 * because Site has no status command. The identifier and the route come from
 * the caller, never from the form.
 */
export function toUpdateSiteRequest(values: SiteFormValues): SiteUpdateRequest {
  return {
    name: values.name.trim(),
    location: optionalText(values.location),
    governorateCode: optionalText(values.governorateCode),
  }
}
