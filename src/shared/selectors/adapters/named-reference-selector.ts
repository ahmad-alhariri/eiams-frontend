import type { NamedReference } from '@/modules/catalog/types/catalog.types'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type NamedReferenceLoader = EntityLoader<NamedReference>

/**
 * Adapter for the contract's generic reference shape (`{ id, displayName }`),
 * used wherever a document references an entity by name (warehouse, site, org unit,
 * material, ...). Label = displayName; the contract only returns active references
 * so all options are enabled.
 */
const namedReferenceAdapter: EntitySelectorAdapter<NamedReference> =
  createEntitySelectorAdapter<NamedReference>({
    toOption: (reference) => ({
      value: reference.id,
      label: reference.displayName,
      disabled: false,
      payload: reference,
    }),
  })

/**
 * Scope-ready NamedReference selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useNamedReferenceSelector(
  loadReferences: NamedReferenceLoader,
): EntitySelectorResult<NamedReference> {
  const loadOptions = useScopedEntityOptions(namedReferenceAdapter, loadReferences)
  return { options: namedReferenceAdapter, loadOptions }
}
