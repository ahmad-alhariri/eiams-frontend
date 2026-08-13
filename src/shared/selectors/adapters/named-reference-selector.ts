import type { NamedReference } from '@/shared/types/generated/eiams-v1'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type NamedReferenceLoader = EntityLoader<NamedReference>

/**
 * Adapter for the contract's generic reference shape (`{ id, code?, displayName, status? }`),
 * used wherever a document references an entity by name (warehouse, site, org unit,
 * material, ...). Label = displayName, hint = code, and references explicitly marked
 * inactive are disabled.
 */
const namedReferenceAdapter: EntitySelectorAdapter<NamedReference> =
  createEntitySelectorAdapter<NamedReference>({
    toOption: (reference) => ({
      value: reference.id,
      label: reference.displayName,
      disabled: reference.status != null && reference.status !== 'Active',
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
