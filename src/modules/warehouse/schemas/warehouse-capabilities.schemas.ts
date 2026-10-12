import { z } from 'zod'

/**
 * The grant endpoint accepts exactly two fields: a warehouseId and a
 * materialDomainId. The handler is idempotent (re-activation on a
 * unique-key conflict), so the form's "Grant" button submits even when
 * the capability row is Inactive. The active-scope check is server-side
 * and requires `warehouse.manage`; the gate is the query layer's
 * `has('warehouse.manage')` and is not duplicated here.
 */
export const grantCapabilitySchema = z.object({
  materialDomainId: z.uuid('يجب اختيار مجال مواد صالح.'),
})

export type GrantCapabilityFormValues = z.infer<typeof grantCapabilitySchema>

/**
 * The revoke endpoint carries no body: the capability id is the route
 * parameter. The form only confirms intent and hands back the id.
 */
export const revokeCapabilitySchema = z.object({
  capabilityId: z.uuid('تعذّر تحديد معرّف القدرة المطلوب إبطالها.'),
})

export type RevokeCapabilityFormValues = z.infer<typeof revokeCapabilitySchema>
