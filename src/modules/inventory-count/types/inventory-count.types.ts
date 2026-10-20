import type { operations } from '@/shared/types/generated/eiams-v1'

/**
 * Contract-derived query/plan types for the inventory-count module
 * (e20-t01). The list/read query filters and the plan-create request still
 * come from the snapshot because the live controller matches them.
 *
 * The actuals batch is handwritten: it is the body of `PUT
 * /inventory-counts/{countId}/actuals` (RESOLUTION-025), whose shape is
 * `(actuals: [{ lineId, actualQuantity }], expectedRowVersion)` — the
 * aggregate count row version, no per-line rowVersion. The batch is
 * all-or-nothing and the live response is `ApiResponse<EmptyResponse>`,
 * so the service refetches after a successful PUT (see `count.service.ts`).
 */
export type ListInventoryCountsQuery = NonNullable<
  operations['listInventoryCounts']['parameters']['query']
>
export type InventoryCountPlanRequest =
  operations['planInventoryCount']['requestBody']['content']['application/json']

/**
 * Handwritten request body for `PUT /inventory-counts/{countId}/actuals`
 * (D-INT-02). Verified against
 * `Web.Api.Controllers.InventoryCounts.RecordInventoryCountActualsController-RequestBody`
 * on 2026-10-20.
 *
 * Per RESOLUTION-025 (C:\EIAMS-SYSTEM\docs\integration\conflict-resolution.md:3220,
 * CONFLICT-020 in conflict-register.md:1563-1631): each entry carries the line
 * id and the exact actual quantity only. The aggregate `expectedRowVersion`
 * is the COUNT row version, not per-line. The batch is all-or-nothing; the
 * controller rejects duplicate lineIds, lines outside the count, missing or
 * invalid actuals, and stale aggregate versions with a 409.
 */
export interface UpdateCountLinesRequest {
  readonly actuals: ReadonlyArray<{
    readonly lineId: string
    readonly actualQuantity: number
  }>
  readonly expectedRowVersion: number
}

/**
 * Live `200` body of `PUT /inventory-counts/{countId}/actuals`. The controller
 * resolves with `ApiResponse<EmptyResponse>` (an empty `{}`); the service
 * refetches the count and lines after a successful save rather than reading
 * data from the PUT response.
 */
export type EmptyResponse = Record<string, never>

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

/**
 * An inventory-count line counts a serialized asset (rather than a bulk
 * quantity) when the contract supplies an `assetId`. For asset lines the
 * operator verifies presence (1) or loss (0), and the asset's `assetNumber`
 * is surfaced in the UI. Derived directly from `InventoryCountLine`.
 */
export function isAssetCountLine(line: { assetId?: string | null }): boolean {
  return line.assetId !== undefined && line.assetId !== null
}

/*
 * Deliberately absent: any client-side "variance" helper for a STORED line.
 *
 * A count line's difference is a server-owned read model
 * (`InventoryCountLine.difference`). A line whose `actualQuantity` is null is
 * *unentered*, not a full shortfall, and must never be rendered or gated as a
 * variance — see kc7v and eiams-frontend-ef78. Read `line.difference` directly
 * and bucket with `summarizeCountLines` in `utils/count-review.ts`.
 *
 * The quantity-entry workspace previews a difference only for its own unsaved
 * draft input, which is a local form concern, not a stored read model; that
 * preview lives with the entry schema, not here.
 */
