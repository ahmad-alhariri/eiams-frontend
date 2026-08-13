import type { Site } from '@/shared/types/generated/eiams-v1'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type SiteLoader = EntityLoader<Site>

/**
 * Site selector adapter: label = Arabic name, hint = code (carried in the
 * payload), and inactive sites are disabled. Typed against the full `Site`
 * contract entity — no dedicated SiteReference type exists.
 */
const siteAdapter: EntitySelectorAdapter<Site> = createEntitySelectorAdapter<Site>({
  toOption: (site) => ({
    value: site.siteId,
    label: site.nameAr,
    disabled: site.status !== 'Active',
    payload: site,
  }),
})

/**
 * Scope-ready site selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useSiteSelector(loadSites: SiteLoader): EntitySelectorResult<Site> {
  const loadOptions = useScopedEntityOptions(siteAdapter, loadSites)
  return { options: siteAdapter, loadOptions }
}
