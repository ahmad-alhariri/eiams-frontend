import { useCachedSession } from '@/modules/auth/hooks/use-cached-session'

/**
 * Banner explaining that the active session scope grants read-only access to
 * this document (D-OPEN-02, PRD §4.3, §4.4, §5.11).
 *
 * Site- and Enterprise-scoped Warehouse Managers can inspect operational
 * records (read paths) but must never mutate them. The existing per-action
 * permission gate already hides every mutation button; this banner is the
 * user-facing explanation so the missing controls do not look like a bug.
 *
 * The session is read through the exported `useCachedSession` observer rather
 * than a private `useQuery`, so this surface cannot drift from the guards.
 * Colors come from the documented `warning` token family
 * (`docs/design-tokens.md` §2), matching the signed-original notice in
 * `shared/documents/attachment-panel.tsx`.
 *
 * Returns `null` when the active scope is Warehouse or when the session has
 * not yet loaded.
 */
export function DocumentScopeReadOnlyBanner(): React.JSX.Element | null {
  const session = useCachedSession()

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
      className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      {messageAr}
    </div>
  )
}
