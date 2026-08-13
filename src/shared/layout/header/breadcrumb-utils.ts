import { matchPath } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'

/**
 * Resolves the route-key trail for a pathname by walking ROUTE_METADATA
 * parents (ui-design.md 4.2 "Breadcrumb navigation"). Detail variants match
 * via their `:param` patterns. Returns null for unlisted paths so the header
 * stays empty on 404s instead of linking to nothing.
 */
export function resolveRouteTrail(pathname: string): RouteKey[] | null {
  const entry = (Object.keys(ROUTE_PATHS) as RouteKey[]).find((key) =>
    matchPath(ROUTE_PATHS[key], pathname),
  )
  if (!entry) {
    return null
  }
  const trail: RouteKey[] = []
  let current: RouteKey | undefined = entry
  while (current) {
    trail.unshift(current)
    current = ROUTE_METADATA[current].parent
  }
  return trail
}
