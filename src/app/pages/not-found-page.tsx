import { IconSearchOff } from '@tabler/icons-react'

import { EmptyState } from '@/shared/feedback/empty-state'
import { Button } from '@/shared/ui/button'
import { ROUTE_PATHS } from '@/config/routes'

/**
 * Unlisted-URL page (D-RBAC-01). Landing on any unknown URL shows this page —
 * never a permission experiment or a silent redirect. Rendered inside the app
 * frame once the shell lands so navigation stays available.
 */
function NotFoundPage() {
  return (
    <EmptyState
      icon={<IconSearchOff className="size-12" aria-hidden />}
      title="الصفحة غير موجودة"
      description="الرابط الذي حاولت الوصول إليه غير مسجّل في النظام. تحقق من العنوان أو عد إلى لوحة المعلومات."
      action={
        <Button nativeButton={false} render={<a href={ROUTE_PATHS.dashboard} />}>
          العودة إلى لوحة المعلومات
        </Button>
      }
    />
  )
}

export default NotFoundPage
