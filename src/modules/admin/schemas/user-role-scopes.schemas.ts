import { z } from 'zod'

import type {
  ReplaceRoleScopesRequest,
  ScopeType,
  UserRoleScope,
  UserSummary,
} from '@/shared/types/generated/eiams-v1'

export const ROLE_SCOPE_TYPES = [
  'Enterprise',
  'Site',
  'Warehouse',
] as const satisfies readonly ScopeType[]

const roleScopeAssignmentSchema = z
  .object({
    roleId: z.uuid('يجب اختيار دور صالح.'),
    scopeType: z.enum(ROLE_SCOPE_TYPES),
    scopeId: z.string().trim(),
  })
  .superRefine((assignment, context) => {
    if (assignment.scopeType !== 'Enterprise' && !z.uuid().safeParse(assignment.scopeId).success) {
      context.addIssue({
        code: 'custom',
        message: 'يجب إدخال معرّف نطاق صالح.',
        path: ['scopeId'],
      })
    }
  })

/** Complete replacement form for the contract-backed role-scope assignment set. */
export const userRoleScopesSchema = z.object({
  assignments: z.array(roleScopeAssignmentSchema),
  rowVersion: z.number().int().min(1, 'تعذّر تحديد إصدار المستخدم الحالي.'),
})

export type UserRoleScopesFormValues = z.infer<typeof userRoleScopesSchema>

export function toUserRoleScopesFormValues(
  user: UserSummary,
  roleScopes: readonly UserRoleScope[],
): UserRoleScopesFormValues {
  return {
    assignments: roleScopes.map((roleScope) => ({
      roleId: roleScope.role.roleId,
      scopeType: roleScope.scope.scopeType,
      scopeId: roleScope.scope.scopeId ?? '',
    })),
    rowVersion: user.rowVersion,
  }
}

/** Maps validated form values to the exact full-replacement transport contract. */
export function toReplaceRoleScopesRequest(
  values: UserRoleScopesFormValues,
): ReplaceRoleScopesRequest {
  return {
    assignments: values.assignments.map((assignment) => ({
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeType === 'Enterprise' ? null : assignment.scopeId,
    })),
    rowVersion: values.rowVersion,
  }
}
