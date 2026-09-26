import { Skeleton } from '@/shared/ui/skeleton'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'

/**
 * Renders the server-selected active scope as a read-only badge.
 *
 * The backend exposes exactly one persistent `UserRoleScope` per user
 * (D-SRS-01, D-RBAC-02) and one required activeScope on the session.
 * There is no scope choice for the ordinary user — the previous picker
 * targeted a contract endpoint that the real backend does not publish.
 * This component is therefore a single render path: the singular scope's
 * Arabic displayName (or scopeType when the display name is absent).
 *
 * The hook exposes a minimal read-only surface; the session query's loading
 * state is owned by the application root. When the cache is empty and the
 * session has not yet hydrated, the badge renders a skeleton; when hydrated
 * without a scope, it renders nothing (the route guards own the
 * no-access state).
 */
function ActiveScopeBadge() {
  const { activeScope, activeScopeCacheKey } = useActiveScopeContext()

  if (activeScope === undefined || activeScopeCacheKey === undefined) {
    return (
      <div
        data-slot="active-scope-badge"
        aria-busy="true"
        aria-label="جارٍ تحميل نطاق العمل"
        className="hidden items-center gap-2 md:flex"
      >
        <Skeleton className="h-8 w-36 bg-forest-light before:via-sidebar-border/30" />
      </div>
    )
  }

  const scopeTypeLabel: Record<typeof activeScopeCacheKey.kind, string> = {
    enterprise: 'المؤسسة',
    site: 'الموقع',
    warehouse: 'المستودع',
  }

  return (
    <div
      data-slot="active-scope-badge"
      aria-label="نطاق العمل الحالي"
      className="hidden min-w-0 items-center gap-2 text-sidebar-border md:flex"
    >
      <span className="text-xs font-medium whitespace-nowrap">نطاق العمل</span>
      <span className="max-w-48 truncate text-sm font-semibold text-white">
        {activeScope.displayName?.trim() || scopeTypeLabel[activeScopeCacheKey.kind]}
      </span>
    </div>
  )
}

export { ActiveScopeBadge }
