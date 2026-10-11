import type { Material } from '@/modules/catalog/types/catalog.types'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type MaterialLoader = EntityLoader<Material>

/**
 * Material selector adapter: label = Arabic name, hint = code (carried in the
 * payload), and inactive materials are disabled. Typed against the full
 * `Material` contract entity — no dedicated MaterialReference type exists.
 *
 * `value` is the catalog entity id, `id`; `materialId` was the frozen generated
 * snapshot's fiction and no catalog projection carries it.
 */
const materialAdapter: EntitySelectorAdapter<Material> = createEntitySelectorAdapter<Material>({
  toOption: (material) => ({
    value: material.id,
    label: material.nameAr,
    disabled: material.status !== 'Active',
    payload: material,
  }),
})

/**
 * Scope-ready material selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useMaterialSelector(loadMaterials: MaterialLoader): EntitySelectorResult<Material> {
  const loadOptions = useScopedEntityOptions(materialAdapter, loadMaterials)
  return { options: materialAdapter, loadOptions }
}
