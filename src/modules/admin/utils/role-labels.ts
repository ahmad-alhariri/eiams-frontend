/**
 * Arabic role labels for the administration directory.
 *
 * WHY THIS EXISTS. The users table used to render `UserDirectoryRow.roleName`
 * verbatim, which is the role's CODE (`SYSTEM_ADMIN`), not a label. The backend
 * is explicit about that: `GetUsersQueryHandler` projects
 * `item.Assignment == null ? null : item.Role.Name` — the `name` column, never
 * `nameAr` — because the directory row joins to the role for identity, not for
 * presentation. So the Arabic label has exactly one source: `GET /admin/roles`,
 * which serves `nameAr` for every role and which the users page already fetches.
 *
 * The resolution therefore belongs in one place rather than in each screen that
 * shows a role. It was previously spelled three different ways — a `Map` built
 * inline in `user-detail-page.tsx`, a `roles.find(...)` in
 * `user-form-dialog.tsx`, and nowhere at all in `users-list-page.tsx` — and the
 * third one is the defect this module exists to fix.
 */

/** The catalogue fields a label needs. Narrower than `RoleProjection` on purpose. */
export interface RoleLabelSource {
  readonly id: string
  readonly nameAr: string
}

/**
 * Maps role id to Arabic label.
 *
 * A `ReadonlyMap` rather than a `Record` because a role id is a GUID: an object
 * key would work by accident today and silently collide with a prototype
 * member the day someone reads `labels.constructor`.
 */
export function buildRoleLabelMap(
  roles: readonly RoleLabelSource[] | undefined,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>()

  for (const role of roles ?? []) {
    labels.set(role.id, role.nameAr)
  }

  return labels
}

/**
 * The Arabic label for one role, or the value already in hand.
 *
 * The FALLBACK is the served value, not a placeholder. When the catalogue cannot
 * be read — the viewer holds `admin.user.manage` but not `admin.role.view`, and
 * `GET /admin/roles` answers 403 — the row's own `roleName` is all that exists,
 * and it is the server-resolved role CODE. Rendering anything else would mean
 * inventing a label the catalogue never supplied, so the code is shown verbatim
 * and the operator is not told a lie in Arabic. `user-detail-page.tsx` already
 * documents this contract for the assignment editor; it applies equally here.
 *
 * Returns `null` only for a user with no assignment, which is a legitimate
 * intermediate state: the backend sends `roleId`, `roleName` and `scopeType` as
 * three nulls together rather than omitting the row.
 */
export function resolveRoleLabelAr(
  labels: ReadonlyMap<string, string>,
  roleId: string | null | undefined,
  servedRoleName: string | null | undefined,
): string | null {
  if (roleId === null || roleId === undefined) {
    return null
  }

  return labels.get(roleId) ?? servedRoleName ?? null
}
