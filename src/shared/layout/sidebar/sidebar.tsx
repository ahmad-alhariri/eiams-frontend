import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { NavLink } from 'react-router'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { cn } from '@/shared/utils/class-names'
import { useUiStore } from '@/shared/store/ui.store'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'
import {
  SIDEBAR_NAV_GROUPS,
  filterSidebarNav,
  getNavItemLabel,
  getNavItemPath,
  type HasPermission,
  type SidebarNavGroup,
  type SidebarNavItem,
} from '@/shared/layout/sidebar/sidebar-nav-model'

export { type HasPermission } from '@/shared/layout/sidebar/sidebar-nav-model'

/** True ≥1024px (ui-design.md 7 breakpoints). SSR-safe via useSyncExternalStore. */
function useIsLgViewport(): boolean {
  const mediaQuery = '(min-width: 1024px)'
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(mediaQuery)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(mediaQuery).matches,
    () => false,
  )
}

function SidebarNavItemLink({ item, collapsed }: { item: SidebarNavItem; collapsed: boolean }) {
  const label = getNavItemLabel(item)
  const Icon = item.icon

  return (
    <NavLink
      to={getNavItemPath(item)}
      // '/' must match exactly or every route would mark the home item active.
      end={item.routeKey === 'dashboard'}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-md px-4 text-sm font-medium transition-colors duration-150',
          'focus-visible:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          isActive
            ? // Active indicator sits on the inner (content-facing) edge: physical
              // `end` in RTL — ui-design.md 4.3 "3px left border", mirrored for RTL.
              'border-e-[3px] border-golden-wheat bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          collapsed && 'justify-center border-e-0 px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={20}
            aria-hidden
            className={cn(
              'shrink-0',
              // ui-design.md 4.3: wheat icon at rest, white while active.
              collapsed ? '' : 'text-golden-wheat',
              isActive && 'text-sidebar-accent-foreground',
            )}
          />
          {collapsed ? null : <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function SidebarNavGroupBlock({
  group,
  collapsed,
}: {
  group: SidebarNavGroup
  collapsed: boolean
}) {
  return (
    <div data-sidebar-group={group.id}>
      {collapsed ? null : (
        <h3 className="px-4 pt-6 pb-2 text-[11px] font-semibold tracking-wide text-sidebar-border uppercase">
          {group.labelAr}
        </h3>
      )}
      <ul className="flex flex-col gap-1" aria-label={group.labelAr}>
        {group.items.map((item) => (
          <li key={item.routeKey}>
            <SidebarNavItemLink item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SidebarScopeIndicator({ collapsed }: { collapsed: boolean }) {
  // This is a cache observer only. Authentication hydration owns fetching and
  // replacement of the authoritative session query.
  const { data: session } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const scopeName =
    session?.scopeState === 'Selected' ? session.activeScope?.displayName : undefined
  const accessibleLabel =
    scopeName === undefined ? 'نطاق العمل غير محدد' : `نطاق العمل الحالي: ${scopeName}`

  return (
    <div
      data-slot="sidebar-scope"
      aria-label={accessibleLabel}
      className={cn(
        'mx-2 mb-2 rounded-md bg-sidebar-accent text-xs text-sidebar-foreground',
        collapsed ? 'flex size-8 items-center justify-center p-0' : 'p-3',
      )}
      title={scopeName === undefined ? 'نطاق العمل غير محدد' : scopeName}
    >
      {collapsed ? (
        <span aria-hidden className="size-2 rounded-full bg-golden-wheat" />
      ) : (
        <>
          <span className="block text-sidebar-border">نطاق العمل</span>
          <span className="mt-1 block truncate font-semibold">
            {scopeName ?? 'لم يُحدّد نطاق العمل'}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * Complete sidebar surface (ui-design.md 4.3): forest continuous panel,
 * 260px/64px width with 300ms width transition, golden-wheat icon accents,
 * emerald-shadow active state, antique-sand group headers. Responsive tiers
 * (ui-design.md 7):
 * - lg+ (≥1024px): static column, width follows the collapse store;
 * - md–lg: icons-only rail (labels hidden, 64px) regardless of the store;
 * - <md: off-canvas drawer (260px, labels) driven by the store, with a
 *   backdrop; Escape closes it and body scroll is locked while open.
 */
type SidebarProps = {
  /** Test-only override; production derives permissions from the session query. */
  hasPermission?: HasPermission | undefined
}

function Sidebar({ hasPermission: hasPermissionOverride }: SidebarProps) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const drawerOpen = useUiStore((state) => state.sidebarDrawerOpen)
  const setDrawerOpen = useUiStore((state) => state.setSidebarDrawerOpen)
  const { hasAll, hasAny } = usePermission()

  const sessionHasPermission = useCallback<HasPermission>(
    (codes, mode) => (mode === 'all' ? hasAll(codes) : hasAny(codes)),
    [hasAll, hasAny],
  )
  const hasPermission = hasPermissionOverride ?? sessionHasPermission

  const isLg = useIsLgViewport()
  // Labels appear when the rail is wide: store-expanded on lg+, or the open
  // drawer on small screens. The md–lg band is always icons (width handled by
  // the md:w-16 tier, labels mirror it here).
  const showLabels = (isLg && !collapsed) || drawerOpen
  const effectiveCollapsed = !showLabels

  const groups = filterSidebarNav(SIDEBAR_NAV_GROUPS, hasPermission)

  useEffect(() => {
    if (!drawerOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [drawerOpen, setDrawerOpen])

  return (
    <>
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden
        className={cn(
          'fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        data-slot="sidebar-backdrop"
      />
      <aside
        data-slot="sidebar"
        className={cn(
          'sticky top-16 flex h-[calc(100vh-4rem)] shrink-0 flex-col bg-sidebar shadow-sidebar transition-[width] duration-300 ease-in-out',
          // Tiered widths: expanded by default, icons-only at md–lg, store-driven
          // 64px from lg up; the open drawer keeps its 260px surface.
          'w-[260px] md:w-16 lg:w-[260px]',
          collapsed && isLg && 'lg:w-16',
          drawerOpen && 'max-lg:w-[260px]',
          // Below md the aside becomes an off-canvas drawer from the right,
          // hidden unless the store opens it. At md–lg it stays in flow as the
          // auto-collapsed icon rail; from lg it is the static column.
          'max-md:fixed max-md:top-16 max-md:right-0 max-md:bottom-0 max-md:z-40 max-md:h-auto',
          drawerOpen ? 'max-md:block' : 'max-md:hidden',
        )}
      >
        <nav aria-label="التنقل الرئيسي" className="min-w-0 flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <SidebarNavGroupBlock key={group.id} group={group} collapsed={effectiveCollapsed} />
          ))}
        </nav>
        <SidebarScopeIndicator collapsed={effectiveCollapsed} />
      </aside>
    </>
  )
}

export { Sidebar }
