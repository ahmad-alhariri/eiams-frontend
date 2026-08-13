import type { ReactNode } from 'react'
import { IconBell, IconMenu2 } from '@tabler/icons-react'

import { cn } from '@/shared/utils/class-names'
import { useUiStore } from '@/shared/store/ui.store'
import { ROUTE_PATHS } from '@/config/routes'

export interface HeaderUser {
  displayName: string
  roleName?: string
}

type AppHeaderProps = {
  /** Breadcrumb trail rendered in the center region (delivered by e05-t06). */
  breadcrumb?: ReactNode
  /** Auth feature composition mounted beside the session controls. */
  scopeSwitcher?: ReactNode
  /** Unread notification count — only the badge is server-driven. */
  notificationsCount?: number
  /** Authenticated session identity — supplied by e06 once auth lands. */
  user?: HeaderUser | undefined
}

/**
 * Application header frame (ui-design.md 4.2): 64px forest bar. Brand block,
 * collapse/menu triggers, center breadcrumb region, notification bell with
 * damask-red badge, and the session user block (avatar circle with forest
 * initials on golden wheat, name + role). The user dropdown menu and live
 * counts arrive with e06 auth — until a session exists the user block is not
 * rendered and the bell shows no badge.
 */
function AppHeader({ breadcrumb, scopeSwitcher, notificationsCount = 0, user }: AppHeaderProps) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed)
  const setDrawerOpen = useUiStore((state) => state.setSidebarDrawerOpen)

  const userInitials = user ? user.displayName.trim().slice(0, 2) : ''

  return (
    <header
      data-slot="app-header"
      className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 bg-forest px-4 text-white"
    >
      <button
        type="button"
        aria-label="فتح قائمة التنقل"
        className="flex size-9 items-center justify-center rounded-md hover:bg-forest-light lg:hidden"
        onClick={() => setDrawerOpen(true)}
      >
        <IconMenu2 size={20} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
        className="hidden size-9 items-center justify-center rounded-md hover:bg-forest-light lg:flex"
        onClick={toggleCollapsed}
      >
        <IconMenu2
          size={20}
          aria-hidden
          className={cn('transition-transform duration-300', collapsed && 'rotate-180')}
        />
      </button>

      <a
        href={ROUTE_PATHS.dashboard}
        className="flex items-center gap-2 text-lg font-bold"
        aria-label="الرئيسية"
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-golden-wheat text-sm font-black text-forest">
          هـ
        </span>
        EIAMS
      </a>

      <div
        data-slot="app-header-breadcrumb"
        className="hidden min-w-0 flex-1 items-center ps-4 lg:flex"
      >
        {breadcrumb}
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-3">
        {scopeSwitcher}
        <button
          type="button"
          aria-label="الإشعارات"
          className="relative flex size-9 items-center justify-center rounded-md hover:bg-forest-light"
        >
          <IconBell size={20} aria-hidden />
          {notificationsCount > 0 ? (
            <span
              aria-label={`${notificationsCount} إشعارات غير مقروءة`}
              className="absolute top-1 end-1 flex size-4 items-center justify-center rounded-full bg-damask text-[10px] leading-none text-white"
            >
              {notificationsCount}
            </span>
          ) : null}
        </button>

        {user ? (
          <div data-slot="app-header-user" className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-full bg-golden-wheat text-sm font-bold text-forest"
            >
              {userInitials}
            </span>
            <span className="hidden max-w-40 truncate text-start md:block">
              <span className="block truncate text-sm font-medium text-white">
                {user.displayName}
              </span>
              {user.roleName ? (
                <span className="block truncate text-xs text-sidebar-border">{user.roleName}</span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  )
}

export { AppHeader }
