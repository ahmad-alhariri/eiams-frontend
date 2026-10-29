import { ROUTE_PATHS } from '@/config/routes'
import type { RouteKey } from '@/config/routes'

/** The id of the shell's main region - the skip link and the focus move target. */
export const APP_MAIN_ID = 'app-main'

/**
 * Matches a pathname to the route key that owns it.
 *
 * The most specific route wins: a literal segment beats a `:param` segment, so
 * `/assets/42` resolves to the asset detail route rather than to a list route.
 */
export function matchRouteKey(pathname: string): RouteKey | null {
  const parts = pathname.split('/').filter((part) => part !== '')
  let best: RouteKey | null = null
  let bestScore = -1
  for (const key of Object.keys(ROUTE_PATHS) as RouteKey[]) {
    const pattern = ROUTE_PATHS[key].split('/').filter((part) => part !== '')
    if (pattern.length !== parts.length) {
      continue
    }
    let score = 0
    let matches = true
    for (let index = 0; index < pattern.length; index += 1) {
      const segment = pattern[index] ?? ''
      if (segment.startsWith(':')) {
        continue
      }
      if (segment !== parts[index]) {
        matches = false
        break
      }
      score += 1
    }
    if (matches && score > bestScore) {
      best = key
      bestScore = score
    }
  }
  return best
}
