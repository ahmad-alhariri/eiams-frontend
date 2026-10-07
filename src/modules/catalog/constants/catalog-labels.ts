import type { Material } from '@/modules/catalog/types/catalog.types'

type MaterialKind = Material['materialKind']

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  Consumable: 'مستهلكة',
  Asset: 'أصل ثابت',
}

export interface MaterialKindOption {
  readonly value: MaterialKind
  readonly label: string
}

/**
 * Paired value/label options for `<Select>` consumers that render every material
 * kind. Derived from {@link MATERIAL_KIND_LABELS} so the inline literal pair
 * `<SelectItem value="Consumable">مستهلكة</SelectItem>` /
 * `<SelectItem value="Asset">أصل ثابت</SelectItem>` stays defined in exactly one
 * place — both the catalog filter and the material-form dialog consume this
 * array.
 *
 * Intentionally typed over the v1 generated {@link MaterialKind} (currently
 * `Consumable | Asset`). The contract enum is `Consumable | Durable | Asset`,
 * but the frontend may not invent a Durable option until D-MAT-01's backend
 * ratification (523i / o098.2) lands — see
 * `eiams-frontend/docs/d-int-01-integration-policy.md` and the material-
 * classification-and-custody-decision for the policy. When the generated
 * types extend, add the new label row here and every consumer follows.
 */
export const MATERIAL_KIND_OPTIONS: readonly MaterialKindOption[] = (
  Object.entries(MATERIAL_KIND_LABELS) as ReadonlyArray<[MaterialKind, string]>
).map(([value, label]) => ({ value, label }))
