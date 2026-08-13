import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { resolveRouteTrail } from '@/shared/layout/header/breadcrumb-utils'

/**
 * Route-aware breadcrumb mounted in the AppHeader region. Parents render as
 * links, the current page renders as white text with aria-current. Dev-only
 * and system routes appear with their own labels.
 */
function Breadcrumbs() {
  const { pathname } = useLocation()
  const trail = resolveRouteTrail(pathname)

  useEffect(() => {
    const currentRoute = trail?.at(-1)
    document.title = currentRoute ? `EIAMS — ${ROUTE_METADATA[currentRoute].labelAr}` : 'EIAMS'
  }, [trail])

  if (!trail) {
    return null
  }

  return (
    <nav aria-label="مسار التنقل">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-sidebar-border">
        {trail.map((key, index) => {
          const isLast = index === trail.length - 1
          const { labelAr } = ROUTE_METADATA[key]
          return (
            <li key={key} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-sidebar-border">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span aria-current="page" className="truncate font-medium text-white">
                  {labelAr}
                </span>
              ) : (
                <Link
                  to={ROUTE_PATHS[key]}
                  className="truncate hover:underline focus-visible:underline"
                >
                  {labelAr}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumbs }
