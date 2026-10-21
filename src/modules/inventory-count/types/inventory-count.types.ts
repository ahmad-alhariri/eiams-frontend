/**
 * Live inventory-count wire types (IC-FE-1 frozen contract).
 *
 * Handwritten flat DTOs — the module speaks the LIVE shapes directly through
 * `shared/api/api-transport` and imports nothing from
 * `@/shared/types/generated/eiams-v1` (stale by design).
 *
 * Naming:
 *  - IDs and version numbers are the wire's own keys (`id`, `rowVersion`,
 *    `expectedRowVersion`); there is no `countId`/`countLineId` payload field
 *    and no per-line rowVersion — every mutation carries the COUNT's
 *    `expectedRowVersion`.
 *  - Timestamps use the wire's `*AtUtc` keys, all nullable.
 *  - The server computes `difference` and `summary`; the UI renders them.
 */

/** Count type (PascalCase wire strings). */
export type CountType = 'Scheduled' | 'Surprise' | 'Cycle'

/** Scope type (PascalCase wire strings). */
export type CountScopeType = 'EntireWarehouse' | 'MaterialDomain' | 'SelectedMaterials'

/** Freeze policy (PascalCase wire strings). */
export type CountFreezePolicy = 'SoftFreeze' | 'HardFreeze' | 'NoFreeze'

/** Lifecycle status; `Aborted` is a real terminal state — never dropped. */
export type CountStatus = 'Planned' | 'InProgress' | 'Completed' | 'Closed' | 'Aborted'

/** Settlement state of the count's differences. */
export type CountSettlementStatus = 'NotRequired' | 'Pending' | 'Settled'

/** Server-computed totals for the count (`InventoryCountResponse.Summary`). */
export interface CountSummary {
  readonly totalLines: number
  readonly countedLines: number
  readonly varianceLines: number
  readonly totalAbsoluteDifference: number
}

/** Server-computed settlement projection; ids are null while `NotRequired`. */
export interface CountSettlement {
  readonly status: CountSettlementStatus
  readonly adjustmentId: string | null
  readonly adjustmentStatus: string | null
}

/**
 * List projection (`GET /inventory-counts`). Flat: ids and timestamps only —
 * no `warehouse`/`material`/`createdBy` objects, no names, no totals.
 */
export interface InventoryCountListItem {
  readonly id: string
  readonly warehouseId: string
  readonly countType: CountType
  readonly scopeType: CountScopeType
  readonly freezePolicy: CountFreezePolicy
  readonly status: CountStatus
  readonly rowVersion: number
  readonly plannedAtUtc: string | null
  readonly startedAtUtc: string | null
  readonly completedAtUtc: string | null
  readonly closedAtUtc: string | null
  readonly abortedAtUtc: string | null
}

/**
 * Detail projection (`GET /inventory-counts/{countId}`): the list fields plus
 * the scope's `materialDomainId` (present only for `MaterialDomain`), the
 * server `summary`, and the `settlement` projection.
 */
export interface InventoryCount extends InventoryCountListItem {
  readonly materialDomainId: string | null
  readonly summary: CountSummary
  readonly settlement: CountSettlement
}

/**
 * One count line (`GET /inventory-counts/{countId}/lines`). NO rowVersion —
 * a line's identity is its `id`; the versioned save carries the count's
 * `expectedRowVersion` (one bump per batch, all-or-nothing). `difference` and
 * `varianceReason` are server-owned read-only facts.
 */
export interface InventoryCountLine {
  readonly id: string
  readonly materialId: string
  readonly assetId: string | null
  readonly snapshotQuantity: number
  readonly actualQuantity: number | null
  /** Server-computed; null-guarded at every render, never recomputed here. */
  readonly difference: number | null
  readonly varianceReason: string | null
}

/** `POST /inventory-counts` body (closed; any extra key is a 400). */
export interface PlanCountRequest {
  readonly warehouseId: string
  readonly countType: CountType
  readonly scopeType: CountScopeType
  /** Present only when `scopeType === 'MaterialDomain'`, absent otherwise. */
  readonly materialDomainId?: string
  /** Always present: the picked ids for `SelectedMaterials`, `[]` otherwise. */
  readonly materialIds: readonly string[]
  readonly freezePolicy: CountFreezePolicy
  /** Non-blank (≤500) only when `freezePolicy !== 'SoftFreeze'`; omitted for SoftFreeze. */
  readonly freezePolicyReason?: string
}

/** `{ expectedRowVersion }` bodies shared by start/complete/close. */
export interface CountRowVersionRequest {
  readonly expectedRowVersion: number
}

/** `POST /{countId}/cancel`; the reason is required, non-blank, ≤500. */
export interface CancelCountRequest {
  readonly reason: string
  readonly expectedRowVersion: number
}

/** `PUT /{countId}/status`; `reason` accompanies the transitions that need one. */
export interface UpdateCountStatusRequest {
  readonly targetStatus: CountStatus
  readonly expectedRowVersion: number
  readonly reason?: string
}

/** `PUT /{countId}/freeze-policy` (Planned only); reason rule as on plan. */
export interface UpdateFreezePolicyRequest {
  readonly freezePolicy: CountFreezePolicy
  readonly freezePolicyReason?: string
  readonly expectedRowVersion: number
}

/** `PUT /{countId}/lines/{lineId}/actual`. */
export interface UpdateLineActualRequest {
  readonly actualQuantity: number
  readonly expectedRowVersion: number
}

/** `PUT /{countId}/lines/{lineId}/variance-reason`. */
export interface SetLineVarianceReasonRequest {
  readonly reason: string
  readonly expectedRowVersion: number
}

/**
 * Batch body of `PUT /inventory-counts/{countId}/actuals`. The wire carries
 * ONLY `{ actuals: [{ lineId, actualQuantity }], expectedRowVersion }` — the
 * aggregate count row version, no per-line rowVersion. All-or-nothing, one
 * version bump.
 */
export interface UpdateCountLinesRequest {
  readonly actuals: ReadonlyArray<{
    readonly lineId: string
    readonly actualQuantity: number
  }>
  readonly expectedRowVersion: number
}

/** 201/Article bodies `{ id }` (plan creates, adjustment draft). */
export type ResourceId = { readonly id: string }

/** `GET /warehouses/{warehouseId}/inventory-freeze-status`. */
export interface InventoryFreezeStatus {
  readonly warehouseId: string
  readonly isPostingBlocked: boolean
  readonly isProvisional: boolean
  readonly hasSoftFreezeWarning: boolean
  readonly activeCounts: ReadonlyArray<{
    readonly countId: string
    readonly freezePolicy: CountFreezePolicy
  }>
}

/** The paged read contract shared by list + lines (`transport.requestPage`). */
export interface CountPage<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
  readonly hasPreviousPage: boolean
  readonly hasNextPage: boolean
}

/** Query for the paged count list; `warehouseId` is OPTIONAL (cross-warehouse when omitted). */
export interface ListCountsQuery {
  readonly warehouseId?: string
  readonly status?: CountStatus
  readonly page?: number
  readonly pageSize?: number
}

/** Query for the paged count-lines read. */
export interface ListCountLinesQuery {
  readonly page?: number
  readonly pageSize?: number
  readonly onlyVariance?: boolean
}

/** Arabic labels for the lifecycle, including `Aborted`. */
export const INVENTORY_COUNT_STATUS_LABELS_AR = {
  Planned: 'مخططة',
  InProgress: 'جارية',
  Completed: 'مكتملة',
  Closed: 'مغلقة',
  Aborted: 'ملغاة',
} as const

/** Arabic labels for the live count types. */
export const INVENTORY_COUNT_TYPE_LABELS_AR = {
  Scheduled: 'جرد مجدول',
  Surprise: 'جرد مفاجئ',
  Cycle: 'جرد دوري',
} as const

/** Arabic labels for the live scope types. */
export const INVENTORY_COUNT_SCOPE_LABELS_AR = {
  EntireWarehouse: 'المستودع كاملاً',
  MaterialDomain: 'حسب مجال المواد',
  SelectedMaterials: 'مواد محددة',
} as const

/** Arabic labels for the freeze policies (rendered from the DTO, never hard-coded). */
export const INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR = {
  SoftFreeze: 'تجميد مرن (SoftFreeze)',
  HardFreeze: 'تجميد صارم (HardFreeze)',
  NoFreeze: 'بدون تجميد (NoFreeze)',
} as const

/**
 * An inventory-count line counts a serialized asset (rather than a bulk
 * quantity) when the contract supplies an `assetId`. For asset lines the
 * operator verifies presence (1) or loss (0).
 */
export function isAssetCountLine(line: { assetId?: string | null }): boolean {
  return line.assetId !== undefined && line.assetId !== null
}

/*
 * Deliberately absent: any client-side "variance" helper for a STORED line.
 *
 * A stored line's `difference` (and the count's `summary`) is a server-owned
 * read model. A line whose `actualQuantity` is null is *unentered*, not a full
 * shortfall, and must never be rendered or gated as a variance — see kc7v and
 * eiams-frontend-ef78. Read `line.difference` directly and bucket with
 * `summarizeCountLines` in `utils/count-review.ts`.
 *
 * The quantity-entry workspace previews a difference only for its own unsaved
 * draft input, which is a local form concern, not a stored read model; that
 * preview lives with the entry schema, not here.
 */
