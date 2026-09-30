import { useQuery } from '@tanstack/react-query'
import { IconChevronDown, IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react'
import { useNavigate } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { useLogoutMutation } from '@/modules/auth/hooks/use-logout-mutation'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { normalizeApiError } from '@/shared/services/api-error'
import { toast } from '@/shared/ui/toast-manager'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

/**
 * Observes the single query-backed session projection without triggering a
 * second hydration request — the same cache-observer idiom as
 * `usePermission`/`useCachedSession`. The application root owns hydration;
 * this component only decides what the session menu may offer.
 */
function useCachedSession(): SessionResponse | undefined {
  const { data } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  return data
}

/** Arabic role context (D-AUTH-01 shell requirement) from the effective roles. */
function roleContext(session: SessionResponse): string {
  return session.activeRoles.map((role) => role.nameAr).join('، ')
}

/**
 * Session user block and its menu (ui-design.md 4.2): avatar, name, role, the
 * dropdown caret, and the profile / settings / logout items.
 *
 * Sign-out is a single click with no confirmation dialog: D-AUTH-01 makes the
 * local session clear final whether or not the server answers, and the
 * anonymous-capable `POST /auth/logout` cannot be undone by staying signed in.
 * The component therefore navigates nowhere itself — `clearSession()` sets
 * `status: 'unauthenticated'` synchronously and `RequireActiveScope`
 * redirects to `/login`.
 */
function SessionUserMenu() {
  const navigate = useNavigate()
  const logoutMutation = useLogoutMutation()
  const session = useCachedSession()

  if (session === undefined) {
    return null
  }

  const roleLabel = roleContext(session)
  const initials = session.user.displayName.trim().slice(0, 2)

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch (error: unknown) {
      // `session-lifecycle.logout()` clears the local session in its `finally`
      // and still rejects when the network call fails, so the user IS signed
      // out. Reporting a failed sign-out would be false; the only honest
      // message is that the local session ended and the server revocation is
      // unconfirmed. A 403 `auth.origin_denied` lands here too — the same
      // safe, non-retrying outcome.
      const apiError = normalizeApiError(error)
      toast.warning({
        title: 'تم إنهاء الجلسة على هذا الجهاز.',
        description: apiError.detailAr ?? apiError.titleAr,
      })
    } finally {
      logoutMutation.reset()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="session-user-menu-trigger"
        aria-label="قائمة المستخدم"
        className="flex items-center gap-2 rounded-md px-1 py-1 text-start hover:bg-forest-light focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-golden-wheat text-sm font-bold text-forest"
        >
          {initials}
        </span>
        <span className="hidden max-w-40 truncate text-start md:block">
          <span className="block truncate text-sm font-medium text-white">
            {session.user.displayName}
          </span>
          {roleLabel ? (
            <span className="block truncate text-xs text-sidebar-border">{roleLabel}</span>
          ) : null}
        </span>
        <IconChevronDown size={20} aria-hidden className="shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={() => navigate(ROUTE_PATHS.profile)}>
          <IconUserCircle aria-hidden />
          الملف الشخصي
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(ROUTE_PATHS.settings)}>
          <IconSettings aria-hidden />
          الإعدادات
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={logoutMutation.isPending}
          onClick={() => {
            void handleLogout()
          }}
        >
          <IconLogout aria-hidden />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SessionUserMenu }
