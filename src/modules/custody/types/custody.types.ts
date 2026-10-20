/**
 * Handwritten wire contracts for the Custody module (D-INT-02).
 *
 * The two mutation request bodies the frontend posts and the list-read query
 * are the only non-generated types the page-level code needs; the live backend
 * serves them with shapes that diverge from the snapshot, so the contract
 * types live here rather than coming from `eiams-v1.ts`.
 *
 * - `POST /assets/{assetId}/custody-assignment` (assignCustody) carries
 *   `{ employeeId, expectedCustodyRowVersion, note? }`. The snapshot's
 *   `CustodyMutationRequest` is a tagged union of the three subject kinds;
 *   Asset-only assign is its own type because it is the only one the live API
 *   exposes today.
 * - `POST /custodies/{custodyId}/transfer` (transferCustody) carries the live
 *   `TransferCustodyRequest` — a separate shape with `subjectType`,
 *   `newHolderType`, `newHolderId`, `newCustodyKind`, `expectedRowVersion`,
 *   `note?`. Do NOT reuse the assign body for transfer.
 * - The list read's filters come from the snapshot because the live
 *   `Custodies/GetCustodies` query parameters match it; this is the only piece
 *   the snapshot still gets right, so it stays generated.
 */
import type { operations } from '@/shared/types/generated/eiams-v1'

/** List-side filters for `GET /custodies`. */
export type ListCustodiesQuery = NonNullable<operations['listCustodies']['parameters']['query']>

/**
 * Request body of `POST /assets/{assetId}/custody-assignment`. Verified against
 * the live swagger (`Web.Api.Controllers.Custodies.AssignAssetCustodyController-RequestBody`)
 * on 2026-10-20.
 *
 * `note` is omitted when the operator leaves the optional reason blank; the
 * live schema marks it `nullable: true` and never requires it. The path's
 * `{assetId}` carries the asset identity the snapshot used to put in the body.
 */
export interface AssignAssetCustodyRequest {
  readonly employeeId: string
  readonly expectedCustodyRowVersion: number
  readonly note?: string | null
}

/**
 * Request body of `POST /custodies/{custodyId}/transfer`. Verified against the
 * live swagger (`Web.Api.Controllers.Custodies.TransferCustodyRequest`) on
 * 2026-10-20. Distinct from the assign body — `subjectType`, `newHolderType`,
 * `newHolderId`, `newCustodyKind`, `expectedRowVersion`, optional `note` —
 * because transfer changes the existing row's holder instead of opening a new
 * one tied to an issue document.
 *
 * The strings here are the live enum names; the string union is annotated
 * rather than reused so a generated enum rename can never silently widen it.
 */
export interface TransferCustodyRequest {
  readonly subjectType: 'Asset' | 'MaterialQuantity' | 'TrackedUnit'
  readonly newHolderType: 'Employee' | 'OrganizationalUnit' | 'ExternalParty' | 'Site'
  readonly newHolderId: string
  readonly newCustodyKind: 'Operational' | 'Personal'
  readonly expectedRowVersion: number
  readonly note?: string | null
}

/**
 * Successful personal-assignment response. The live controller answers 201
 * `ApiResponse<ResourceIdResponse>` = `{ id }` (the new custody row's id),
 * NOT the full custody row. The caller now invalidates and refetches — see
 * `use-custody-queries.ts`.
 */
export interface CustodyAssignmentCreated {
  readonly id: string
}

/**
 * Backwards-compatibility alias: the snapshot exported a `CustodyMutationRequest`
 * union that the assign and transfer dialogs referenced. The handwritten types
 * `AssignAssetCustodyRequest` and `TransferCustodyRequest` carry the live wire
 * shapes; this alias is the union of the two so call-sites still type-check
 * while they are migrated off the snapshot one at a time.
 *
 * shortcut: temp, drop when both dialogs use the specific request type.
 */
export type CustodyMutationRequest = AssignAssetCustodyRequest | TransferCustodyRequest
