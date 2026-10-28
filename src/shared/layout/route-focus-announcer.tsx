import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

import { ROUTE_METADATA } from '@/config/routes'
import { APP_MAIN_ID, matchRouteKey } from '@/shared/layout/route-keys'

/**
 * Moves focus to the main region on every client-side navigation and
 * announces the new page's Arabic name.
 *
 * Without it the focus stays on the link that was activated, so a screen
 * reader keeps reading the navigation instead of the page the user asked for
 * (WCAG 2.4.3 focus order, 4.1.3 status messages).
 */
export function RouteFocusAnnouncer() {
  const location = useLocation()
  const [announcement, setAnnouncement] = useState('')
  const previousPath = useRef(location.pathname)

  useEffect(() => {
    if (previousPath.current === location.pathname) {
      return
    }
    previousPath.current = location.pathname
    const main = document.getElementById(APP_MAIN_ID)
    if (main instanceof HTMLElement) {
      main.focus()
    }
    const key = matchRouteKey(location.pathname)
    setAnnouncement(key === null ? '' : (ROUTE_METADATA[key]?.labelAr ?? ''))
  }, [location.pathname])

  return (
    <div data-slot="route-announcer" role="status" aria-live="polite" className="sr-only">
      {announcement}
    </div>
  )
}
