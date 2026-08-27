import { z } from 'zod'

import type { UserSummary, UserUpsertRequest } from '@/shared/types/generated/eiams-v1'

/** Form-owned fields for the contract-backed user upsert request. */
export const userSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'اسم المستخدم مطلوب.')
    .max(250, 'يجب ألّا يتجاوز الاسم 250 محرفاً.'),
  username: z
    .string()
    .trim()
    .min(1, 'اسم الدخول مطلوب.')
    .max(100, 'يجب ألّا يتجاوز اسم الدخول 100 محرف.'),
  status: z.enum(['Active', 'Suspended']),
})

export type UserFormValues = z.infer<typeof userSchema>

/**
 * Maps UI values to the exact v1 payload and keeps optimistic locking intact.
 * `employeeId` and `initialPassword` are intentionally omitted unless the
 * caller supplies them, matching the contract's optional fields.
 */
export function toUserRequest(
  values: UserFormValues,
  user: UserSummary | null,
): UserUpsertRequest {
  return {
    displayName: values.displayName.trim(),
    username: values.username.trim(),
    status: values.status,
    rowVersion: user?.rowVersion ?? 0,
  }
}
