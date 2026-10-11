import { z } from 'zod'

import type {
  CreateOrganizationRequest,
  Organization,
  UpdateOrganizationRequest,
} from '@/modules/organization/types/organization.types'

const CODE_REQUIRED_MESSAGE = 'رمز الجهة مطلوب.'
const CODE_TOO_LONG_MESSAGE = 'رمز الجهة يجب ألّا يتجاوز 50 محرفاً.'
const NAME_REQUIRED_MESSAGE = 'اسم الجهة يجب أن يتكون من حرفين على الأقل.'
const NAME_TOO_LONG_MESSAGE = 'اسم الجهة يجب ألّا يتجاوز 200 محرف.'

/**
 * One form shape for both organization operations, with the create-only field
 * required only in create mode — the pattern `site.schemas.ts` uses and the one
 * the backend enforces: `POST /organizations` binds `code`, `PUT
 * /organizations/{id}` binds neither, so a code rename is not expressible
 * through this API. The names on the wire are the names on the form: `name`
 * (not `nameAr`).
 *
 * There is no `status` here because neither write body binds it. Activation and
 * deactivation are a separate guarded command
 * ({@link SetOrganizationStatusRequest}), never a field of the form.
 */
export function organizationFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: shown read-only on edit and never sent to the update body.
    code: isCreate
      ? z.string().trim().min(1, CODE_REQUIRED_MESSAGE).max(50, CODE_TOO_LONG_MESSAGE)
      : z.string().trim().max(50, CODE_TOO_LONG_MESSAGE),
    // Both bodies bind `name`, so both modes require it.
    name: z.string().trim().min(2, NAME_REQUIRED_MESSAGE).max(200, NAME_TOO_LONG_MESSAGE),
  })
}

export type OrganizationFormValues = z.infer<ReturnType<typeof organizationFormSchema>>

/** Fresh empty values for a create form (never a shared mutable object). */
export function emptyOrganizationFormValues(): OrganizationFormValues {
  return {
    code: '',
    name: '',
  }
}

/**
 * Seeds the form from an organization READ record, reading `name` and `code` —
 * the fields the projection actually serves. The record has no `nameAr` and no
 * `rowVersion`: Organization is not a versioned aggregate.
 */
export function toOrganizationFormValues(
  organization: Organization | null,
): OrganizationFormValues {
  if (organization === null) return emptyOrganizationFormValues()
  return {
    code: organization.code,
    name: organization.name,
  }
}

/**
 * Maps create values to `POST /organizations`: `name` and `code` — and nothing
 * else. No `status`: a new organization is Active by definition, and status is a
 * separate guarded command. No concurrency token: the row does not exist yet.
 */
export function toCreateOrganizationRequest(
  values: OrganizationFormValues,
): CreateOrganizationRequest {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
  }
}

/**
 * Maps edit values to `PUT /organizations/{id}`: `name` ONLY.
 *
 * `code` is dropped because the update body does not bind it — a code rename is
 * not expressible through this API, so sending one is refused (the request body
 * is `additionalProperties: false`) and the create-only field renders disabled
 * on edit instead. `status` is dropped for the same reason and reaches the
 * server through `useSetOrganizationStatusMutation`.
 */
export function toUpdateOrganizationRequest(
  values: OrganizationFormValues,
): UpdateOrganizationRequest {
  return {
    name: values.name.trim(),
  }
}
