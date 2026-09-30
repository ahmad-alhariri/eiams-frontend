import type { Material } from '@/modules/catalog/types/catalog.types'

type MaterialKind = Material['materialKind']

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  Consumable: 'مستهلكة',
  Asset: 'أصل ثابت',
}
