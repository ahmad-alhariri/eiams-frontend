import type { operations } from '@/shared/types/generated/eiams-v1'

/**
 * Contract-derived query and request shapes for the inventory-count module
 * (e20-t01). The v1 contract narrows the freeze policy to `SoftFreeze` only
 * — PRD §12.6 mentions HardFreeze/NoFreeze, but the generated type is the
 * source of truth; wider policies are a backend contract change first.
 */
export type ListInventoryCountsQuery = NonNullable<
  operations['listInventoryCounts']['parameters']['query']
>
export type InventoryCountPlanRequest =
  operations['planInventoryCount']['requestBody']['content']['application/json']
export type UpdateCountLinesRequest =
  operations['updateInventoryCountLines']['requestBody']['content']['application/json']

/**
 * Arabic labels for the inventory-count lifecycle
 * (`Planned → InProgress → Completed → Closed`).
 */
export const INVENTORY_COUNT_STATUS_LABELS_AR = {
  Planned: 'مخططة',
  InProgress: 'جارية',
  Completed: 'مكتملة',
  Closed: 'مغلقة',
} as const

/** Arabic labels for the count types. */
export const INVENTORY_COUNT_TYPE_LABELS_AR = {
  Full: 'جرد شامل',
  Partial: 'جرد جزئي',
  SpotCheck: 'جرد مفاجئ',
  AssetVerification: 'تحقق أصول',
} as const

/**
 * Arabic labels for scope types; `summaryAr` (server-provided) is preferred
 * for display when present.
 */
export const INVENTORY_COUNT_SCOPE_LABELS_AR = {
  AllMaterials: 'كل المواد',
  ByDomain: 'حسب المجال',
  ByCategory: 'حسب الصنف',
  ByMaterial: 'حسب المادة',
} as const
