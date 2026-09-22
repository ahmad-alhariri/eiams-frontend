import { z } from 'zod'

import type {
  ReplaceRoleScopeRequest,
  ScopeType,
  UserRoleScope,
} from '@/modules/admin/types/admin.api-types'

// DEVIATION NOTE (eiams-frontend-7ipk.2): the task text says to "map directly
// to the generated singular backend request". D-INT-02 / ADR-0001 (accepted,
// supersedes the generation strategy) requires handwritten per-module wire
// contracts instead — hence the import from `./admin.api-types` and no import
// from `@/shared/types/generated/eiams-v1` (see `no-new-generated-imports`).

export const ROLE_SCOPE_TYPES = [
  'Enterprise',
  'Site',
  'Warehouse',
] as const satisfies readonly ScopeType[]

/**
 * Singular role-scope assignment form (D-SRS-01 / D-INT-01): exactly one
 * roleId + one scopeType + one scopeId per user. Zero or multiple assignments
 * are structurally impossible. No rowVersion — unsupported per acceptance.
 */
export const userRoleScopeSchema = z
  .object({
    roleId: z.uuid('يجب اختيار دور صالح.'),
    scopeType: z.enum(ROLE_SCOPE_TYPES),
    scopeId: z.string().trim().nullable(),
  })
  .superRefine((assignment, context) => {
    if (assignment.scopeType === 'Enterprise') {
      return
    }
    if (assignment.scopeId === null || !z.uuid().safeParse(assignment.scopeId).success) {
      context.addIssue({
        code: 'custom',
        message: 'يجب إدخال معرّف نطاق صالح.',
        path: ['scopeId'],
      })
    }
  })

export type UserRoleScopeFormValues = z.infer<typeof userRoleScopeSchema>

export function toUserRoleScopeFormValues(
  roleScope: UserRoleScope | null,
): UserRoleScopeFormValues {
  return {
    roleId: roleScope?.role.roleId ?? '',
    scopeType: roleScope?.scope.scopeType ?? 'Enterprise',
    scopeId: roleScope?.scope.scopeId ?? null,
  }
}

/**
 * Maps validated form values to the exact singular transport contract.
 */
export function toReplaceRoleScopeRequest(
  values: UserRoleScopeFormValues,
): ReplaceRoleScopeRequest {
  return {
    roleId: values.roleId,
    scopeType: values.scopeType,
    scopeId: values.scopeType === 'Enterprise' ? null : values.scopeId,
  }
}
