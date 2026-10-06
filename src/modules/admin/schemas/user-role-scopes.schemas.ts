import { z } from 'zod'

import { isUuidLike } from '@/shared/utils/uuid'
import { ROLE_SCOPE_TYPE_LABELS_AR, type RoleScopeType } from '@/modules/admin/types/role.types'
import type {
  ReplaceUserRoleScopeRequest,
  UserRoleScopeProjection,
} from '@/modules/admin/types/role.types'

/** Assignment scope types, in the order the selector offers them. */
export const ROLE_SCOPE_TYPES = [
  'Enterprise',
  'Site',
  'Warehouse',
] as const satisfies readonly RoleScopeType[]

const roleScopeAssignmentSchema = z
  .object({
    // `isUuidLike`, not `z.uuid()`: the backend's seeded role ids are
    // `00000000-0000-0000-0000-…`, whose RFC-9562 version/variant bits fail Zod 4's
    // strict `uuid`. That rejected the correctly selected role and blocked the save.
    // See shared/utils/uuid.ts.
    roleId: z.string().trim().refine(isUuidLike, 'يجب اختيار دور صالح.'),
    scopeType: z.enum(ROLE_SCOPE_TYPES),
    /**
     * Held as a string in the form so the async scope selector can hold a typed
     * placeholder and an in-flight selection; it is submitted as `null` for
     * Enterprise and validated as an identifier otherwise.
     */
    scopeId: z.string().trim(),
  })
  .superRefine((assignment, context) => {
    if (assignment.scopeType === 'Enterprise') return
    if (!isUuidLike(assignment.scopeId)) {
      context.addIssue({
        code: 'custom',
        message: 'يجب اختيار نطاق صالح.',
        path: ['scopeId'],
      })
    }
  })

/**
 * The user's single role-and-scope assignment (D-SRS-01).
 *
 * Deliberately NOT a collection: one role and one scope, always. The form holds
 * `expectedRowVersion` so the replacement stays conditional on the version it was
 * loaded at; a user with no assignment yet carries version 0, which is what the
 * backend expects for the first write.
 */
export const userRoleScopeSchema = z.object({
  assignment: roleScopeAssignmentSchema,
  expectedRowVersion: z.number().int().min(0, 'تعذّر تحديد إصدار التعيين الحالي.'),
})

export type UserRoleScopeFormValues = z.infer<typeof userRoleScopeSchema>

/**
 * Seeds the form from the served assignment.
 *
 * `assignment` may be `null` (no assignment yet): the form then starts on
 * Enterprise with version 0, which is the state the backend treats as "create
 * the sole assignment".
 */
export function toUserRoleScopeFormValues(
  assignment: UserRoleScopeProjection | null,
): UserRoleScopeFormValues {
  if (assignment === null) {
    return {
      assignment: { roleId: '', scopeType: 'Enterprise', scopeId: '' },
      expectedRowVersion: 0,
    }
  }
  return {
    assignment: {
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId ?? '',
    },
    expectedRowVersion: assignment.rowVersion,
  }
}

/** Maps validated form values to the exact singular replacement contract. */
export function toReplaceUserRoleScopeRequest(
  values: UserRoleScopeFormValues,
): ReplaceUserRoleScopeRequest {
  return {
    roleId: values.assignment.roleId,
    scopeType: values.assignment.scopeType,
    scopeId: values.assignment.scopeType === 'Enterprise' ? null : values.assignment.scopeId,
    expectedRowVersion: values.expectedRowVersion,
  }
}

/** Arabic label for a scope type; exported so the editor and pages share one table. */
export function scopeTypeLabelAr(scopeType: RoleScopeType): string {
  return ROLE_SCOPE_TYPE_LABELS_AR[scopeType]
}
