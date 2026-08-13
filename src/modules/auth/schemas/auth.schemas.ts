import { z } from 'zod'

const UUID_MESSAGE = 'يجب أن يكون المعرّف بصيغة صحيحة.'

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'اسم المستخدم مطلوب.')
    .max(100, 'يجب ألا يتجاوز اسم المستخدم 100 محرف.'),
  password: z
    .string()
    .min(8, 'يجب أن تتكون كلمة المرور من 8 محارف على الأقل.')
    .max(200, 'يجب ألا تتجاوز كلمة المرور 200 محرف.'),
})

const enterpriseScopeSchema = z.object({
  scopeType: z.literal('Enterprise'),
  scopeId: z.null(),
})

const siteScopeSchema = z.object({
  scopeType: z.literal('Site'),
  scopeId: z.uuid(UUID_MESSAGE),
})

const warehouseScopeSchema = z.object({
  scopeType: z.literal('Warehouse'),
  scopeId: z.uuid(UUID_MESSAGE),
})

/**
 * Mirrors the D-AUTH-01 active-scope invariant that OpenAPI's nullable UUID
 * type cannot express alone: only Enterprise may use a null scope identifier.
 */
export const setActiveScopeSchema = z.discriminatedUnion('scopeType', [
  enterpriseScopeSchema,
  siteScopeSchema,
  warehouseScopeSchema,
])

export type LoginFormValues = z.infer<typeof loginSchema>
export type SetActiveScopeFormValues = z.infer<typeof setActiveScopeSchema>
