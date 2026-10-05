import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'

import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import type {
  PermissionCatalogEntry,
  ReplaceRolePermissionsRequest,
  RoleProjection,
  RoleScopeTypeName,
} from '@/modules/admin/types/role.types'

/**
 * The permission catalog is server-owned. This form only carries the selected
 * codes from that catalog; it deliberately adds no client-side vocabulary or
 * role-policy rules.
 */
export const rolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string()),
})

export type RolePermissionsFormValues = z.infer<typeof rolePermissionsSchema>

/**
 * Applies the shared contract error shape to either permission editor surface.
 *
 * A missing required member (for example `expectedRowVersion`) is reported by the
 * server against `details.body`, not by field name, so there may be no per-field
 * error to place. The generic message still surfaces through `setFormServerErrors`.
 */
export function applyRolePermissionsServerError(
  form: UseFormReturn<RolePermissionsFormValues>,
  error: unknown,
): void {
  const apiError = normalizeApiError(error)
  setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: ['permissionCodes'] })
  const firstFieldError = apiError.fieldErrors[0]
  if (firstFieldError !== undefined) {
    form.setError('permissionCodes', { type: 'server', message: firstFieldError.messageAr })
  }
}

/**
 * True when the server rejected the write because the role's aggregate version moved on.
 *
 * The wire code is UPPER_SNAKE_CASE. The domain declares `Roles.RowVersionMismatch`
 * and the error envelope republishes it, so keying on the dotted form would never match.
 */
function isRoleVersionConflict(error: unknown): boolean {
  return normalizeApiError(error).code === 'ROLES_ROW_VERSION_MISMATCH'
}

/** How a role-permission write failed, classified once for every editing surface. */
export type RolePermissionWriteOutcome =
  /** The role changed after this form loaded. Reload; never replay the submitted set. */
  | { readonly kind: 'stale-version' }
  /** The server refused the whole set because a code cannot take effect for this role. */
  | { readonly kind: 'scope-mismatch'; readonly titleAr: string; readonly detailAr: string | null }
  /** Anything else. The caller maps `fieldErrors` onto the form as usual. */
  | { readonly kind: 'other' }

/**
 * Single classification for a failed role permission write.
 *
 * Both role-permission surfaces (the full page and the catalog dialog) submit the same
 * operation, so they must explain the same failure the same way. Classifying here is what
 * keeps them from diverging again; the Arabic wording for a server-reported failure comes
 * from the shared error table rather than a local constant, so there is one place to edit.
 */
export function classifyRolePermissionWriteError(error: unknown): RolePermissionWriteOutcome {
  if (isRoleVersionConflict(error)) {
    return { kind: 'stale-version' }
  }

  const apiError = normalizeApiError(error)

  if (apiError.code === 'ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES') {
    return { kind: 'scope-mismatch', titleAr: apiError.titleAr, detailAr: apiError.detailAr }
  }

  return { kind: 'other' }
}

/**
 * Arabic guidance shown when a role-permission write loses to a concurrent change. This is
 * a client action ("reload and review"), not a server error message, so it lives here rather
 * than in the shared error table.
 */
export const ROLE_STALE_VERSION_MESSAGE_AR =
  'أُعيد تحميل بيانات الدور. راجع الصلاحيات ثم أعد الحفظ إن لزم.'

/** One selectable row of the role permission matrix. */
export interface PermissionMatrixRow {
  readonly code: string
  readonly nameAr: string
  readonly descriptionAr: string | null
  readonly allowedScopeTypes: readonly RoleScopeTypeName[]
  /**
   * False when the permission cannot take effect at any scope this role may be
   * assigned at. The server rejects such a grant outright, so the row is shown
   * disabled with the reason rather than offering a selection that cannot be saved.
   */
  readonly grantable: boolean
}

/**
 * Marks each catalog entry as grantable for this role.
 *
 * A grant is only effective when the permission's allowed scope types overlap the
 * role's own allowed scope types; the server refuses the whole replacement
 * otherwise. Computing the same predicate here lets the matrix disable the row and
 * say why, instead of letting the administrator assemble a set the server will
 * reject with no field-level explanation.
 */
export function toPermissionMatrixRows(
  catalog: readonly PermissionCatalogEntry[],
  role: RoleProjection,
): readonly PermissionMatrixRow[] {
  const roleScopes = new Set<string>(role.allowedScopeTypes)

  return catalog.map((permission) => ({
    code: permission.code,
    nameAr: permission.nameAr,
    descriptionAr: permission.descriptionAr,
    allowedScopeTypes: permission.allowedScopeTypes,
    grantable: permission.allowedScopeTypes.some((scopeType) => roleScopes.has(scopeType)),
  }))
}

/**
 * The permission replacement request: the selected codes plus the aggregate version
 * this form was loaded against.
 *
 * Deliberately carries no metadata fields. The retired implementation rebuilt a
 * whole role record here, which both violated the operation-specific request rule
 * and would have resubmitted metadata the form never owned.
 */
export function toReplaceRolePermissionsRequest(
  values: RolePermissionsFormValues,
  role: RoleProjection,
): ReplaceRolePermissionsRequest {
  return {
    permissionCodes: [...values.permissionCodes],
    expectedRowVersion: role.rowVersion,
  }
}
