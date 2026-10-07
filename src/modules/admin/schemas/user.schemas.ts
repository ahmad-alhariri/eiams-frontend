import { z } from 'zod'

import { ROLE_SCOPE_TYPES } from '@/modules/admin/schemas/user-role-scopes.schemas'
import { isUuidLike } from '@/shared/utils/uuid'
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserAccountStatus,
} from '@/modules/admin/types/user.types'

/**
 * One form shape for both account operations.
 *
 * Creation and metadata editing overlap on five fields and differ on four
 * (`password`, `roleId`, `scopeType`, `scopeId`). A single superset shape keeps the
 * form typed without a union, and the differing fields are made REQUIRED only in
 * create mode by {@link userFormSchema} — which is what the backend enforces:
 * `CreateUserController-RequestBody` binds them all, while
 * `UpdateUserController-RequestBody` binds none of them.
 *
 * The account's name is entered as the two fields the server actually stores. The
 * backend never composes a single display name, so the generated form's
 * `displayName` had no field to bind to.
 */
export function userFormSchema(isCreate: boolean) {
  const base = z.object({
    email: z.email('البريد الإلكتروني مطلوب.'),
    username: z
      .string()
      .trim()
      .min(1, 'اسم الدخول مطلوب.')
      .max(100, 'يجب ألّا يتجاوز اسم الدخول 100 محرف.'),
    firstName: z
      .string()
      .trim()
      .min(1, 'الاسم الأول مطلوب.')
      .max(125, 'يجب ألّا يتجاوز الاسم الأول 125 محرفاً.'),
    lastName: z
      .string()
      .trim()
      .min(1, 'اسم العائلة مطلوب.')
      .max(125, 'يجب ألّا يتجاوز اسم العائلة 125 محرفاً.'),
    status: z.enum(['Active', 'Suspended']),
    password: z.string(),
    roleId: z.string().trim(),
    scopeType: z.enum(ROLE_SCOPE_TYPES),
    scopeId: z.string().trim(),
  })

  if (!isCreate) {
    return base
  }

  return base.superRefine((values, context) => {
    if (values.password.length < 8) {
      context.addIssue({
        code: 'custom',
        message: 'يجب ألّا تقل كلمة المرور عن 8 محارف.',
        path: ['password'],
      })
    }
    if (!isUuidLike(values.roleId)) {
      context.addIssue({ code: 'custom', message: 'يجب اختيار دور صالح.', path: ['roleId'] })
    }
    // Enterprise is expressed as the contract's null identifier; every other scope
    // type requires a real one. Only surfaced once the administrator has touched the
    // picker, so choosing "Warehouse" does not immediately accuse them of not having
    // chosen a warehouse yet.
    if (values.scopeType !== 'Enterprise' && !isUuidLike(values.scopeId)) {
      context.addIssue({
        code: 'custom',
        message: 'يجب اختيار نطاق صالح.',
        path: ['scopeId'],
      })
    }
  })
}

export type UserFormValues = z.infer<ReturnType<typeof userFormSchema>>

const ACTIVE: UserAccountStatus = 'Active'

/** Empty values for a fresh account. */
export function emptyUserForm(): UserFormValues {
  return {
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    status: ACTIVE,
    password: '',
    roleId: '',
    scopeType: 'Enterprise',
    scopeId: '',
  }
}

/**
 * Maps validated create values to the exact request body.
 *
 * `scopeId` is the contract's `null` for Enterprise and the chosen UUID otherwise.
 */
export function toCreateUserRequest(values: UserFormValues): CreateUserRequest {
  return {
    email: values.email.trim(),
    username: values.username.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    password: values.password,
    roleId: values.roleId,
    scopeType: values.scopeType,
    scopeId: values.scopeType === 'Enterprise' ? null : values.scopeId,
  }
}

/**
 * Maps validated edit values to the exact request body.
 *
 * Carries no `username` (immutable after creation) and no `status` (its own
 * operation), and no `rowVersion`: no user projection exposes a concurrency token
 * yet, and the backend binds `additionalProperties:false`, so sending one is
 * rejected outright.
 */
export function toUpdateUserRequest(values: UserFormValues, rowVersion: number): UpdateUserRequest {
  return {
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    // The version the form was seeded from: the write is conditional on it, so a
    // concurrent change surfaces as a 409 instead of being overwritten.
    expectedRowVersion: rowVersion,
  }
}
