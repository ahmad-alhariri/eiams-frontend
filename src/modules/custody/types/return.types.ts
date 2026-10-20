/**
 * Handwritten wire contract for the Return eligible-items lookup
 * (D-INT-02): what `GET /returns/eligible-items` actually serves — verified
 * against the live backend (`Returns/GetEligibleItems`). The generated
 * snapshot's shape for this route is stale and MUST NOT be modeled from.
 *
 * One row = one returnable allocation of the original Issue:
 * - `subjectType === 'Asset'` → `subjectId` is the ASSET id, quantities are 1,
 *   and `assetNumber`/`serialNumber` carry the unit identity.
 * - `subjectType === 'MaterialQuantity'` → quantity-tracked durable
 *   allocation, `availableQuantity` = still-active quantity.
 * - `subjectType === 'TrackedUnit'` → serial-tracked durable unit.
 */
export interface ReturnEligibleItem {
  readonly subjectType: 'Asset' | 'TrackedUnit' | 'MaterialQuantity'
  readonly subjectId: string
  readonly materialId: string
  readonly materialNameAr: string
  readonly materialNameEn: string
  readonly materialCode: string
  readonly materialKind: string
  readonly trackingType: string
  readonly serialNumber: string | null
  readonly assetNumber: string | null
  readonly availableQuantity: number
  readonly issuedQuantity: number
}
