import { ROLE_SCOPE_TYPE_LABELS_AR } from '@/modules/admin/types/role.types'
import type { SessionScope, SessionUser } from '@/modules/auth/types/session.types'

/**
 * Human-readable label for the signed-in user.
 *
 * The session projection carries `firstName`, `lastName` and an optional `employeeName`;
 * it does NOT carry a `displayName`. The old generated type declared one, so code reading
 * `session.user.displayName` type-checked while being `undefined` at runtime.
 *
 * Names are assembled in the order a human would say them, which for Arabic names is
 * given name then family name.
 */
export function toSessionUserDisplayName(user: SessionUser): string {
  // Parts are read defensively even though the type declares them as required strings.
  // This runs in the app header: a payload missing a name part would otherwise throw a
  // TypeError during render and take down the whole shell, which is a far worse outcome
  // than showing a slightly less specific name.
  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')

  if (fullName.length > 0) {
    return fullName
  }

  const employeeName = user.employeeName?.trim()
  if (employeeName !== undefined && employeeName.length > 0) {
    return employeeName
  }

  return user.email || '—'
}

/** Up to two characters for the avatar bubble; never empty so the bubble keeps its shape. */
export function toSessionUserInitials(user: SessionUser): string {
  const initials = toSessionUserDisplayName(user)
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')

  return initials.length > 0 ? initials : '؟'
}

/**
 * The Arabic label for the active scope.
 *
 * The server sends `activeScope.scopeName` verbatim, and for the Enterprise scope that is
 * the English word "Enterprise" (backend `GetUserSessionQueryHandler`), so the scope TYPE
 * drives the label — the same Arabic vocabulary the scope Select renders
 * (`ROLE_SCOPE_TYPE_LABELS_AR`), not a second wording. The server's own name is only the
 * fallback for a scope type this build does not know.
 *
 * `activeScope` is required on a loaded session, so an absent label means the scope itself
 * is absent; callers render a neutral fallback rather than `undefined`.
 */
export function toSessionScopeLabel(scope: SessionScope | undefined): string | undefined {
  if (scope === undefined) {
    return undefined
  }

  switch (scope.scopeType) {
    case 'Enterprise':
    case 'Site':
    case 'Warehouse':
      return ROLE_SCOPE_TYPE_LABELS_AR[scope.scopeType]
    default: {
      // Optional-chained like `toSessionUserDisplayName`: a scope that arrives without
      // its name must degrade to the caller's neutral label, not throw inside the sidebar.
      const scopeName = scope.scopeName?.trim()
      return scopeName === undefined || scopeName.length === 0 ? undefined : scopeName
    }
  }
}
