import { IconTools } from '@tabler/icons-react'
import { useLocation } from 'react-router'

import { ROUTE_METADATA } from '@/config/routes'
import { resolveRouteTrail } from '@/shared/layout/header/breadcrumb-utils'
import { EmptyState } from '@/shared/feedback/empty-state'

/**
 * Temporary route-level surface for v1 modules whose feature delivery has not
 * started yet. It deliberately owns no data, actions, or domain decisions:
 * guards still run before it renders and the eventual module replaces only its
 * lazy registry entry.
 */
function RoutePlaceholderPage() {
  const { pathname } = useLocation()
  const routeKey = resolveRouteTrail(pathname)?.at(-1)
  const labelAr = routeKey === undefined ? 'هذه الصفحة' : ROUTE_METADATA[routeKey].labelAr

  return (
    <EmptyState
      icon={<IconTools className="size-12" aria-hidden />}
      title={labelAr}
      description="هذه الواجهة جاهزة ضمن خريطة التنقل، وسيُستكمل محتواها التشغيلي في مرحلة الوحدة المختصة."
    />
  )
}

export default RoutePlaceholderPage
