import { useQuery } from '@tanstack/react-query'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

/**
 * Banner explaining that the active session scope grants read-only access to
 * this document (D-OPEN-02, PRD §4.3, §4.4, §5.11).
 *
 * Site- and Enterprise-scoped Warehouse Managers can inspect operational
 * records (read paths) but must never mutate them. The existing per-action
 * permission gate already hides every mutation button; this banner is the
 * user-facing explanation so the missing controls do not look like a bug.
 *
 * Returns `null` when the active scope is Warehouse or when the session has
 * not yet loaded.
 */
export function DocumentScopeReadOnlyBanner(): React.JSX.Element | null {
  const { data: session } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  if (session === undefined) {
    return null
  }

  if (session.activeScope.scopeType === 'Warehouse') {
    return null
  }

  const messageAr =
    session.activeScope.scopeType === 'Enterprise'
      ? 'صلاحية القراءة فقط على مستوى المنشأة — لا يمكن تعديل عمليات هذا المستودع من نطاقك الحالي.'
      : 'صلاحية القراءة فقط على مستوى الموقع — لا يمكن تعديل عمليات هذا المستودع من نطاقك الحالي.'

  return (
    <div
      data-slot="document-scope-read-only-banner"
      role="status"
      dir="rtl"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {messageAr}
    </div>
  )
}
