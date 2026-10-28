/**
 * Handwritten wire contracts for the Custody module (D-INT-02 / ADR-0001).
 *
 * The live rows are FLAT and camelCase. The frozen design snapshot
 * (the generated artifact, since deleted) described a nested `holder` object
 * and the field names `fromTs` / `toTs`; none of them exist on the wire, so
 * nothing here may be typed against the snapshot.
 *
 * Verified against the live swagger and the backend DTOs:
 * - `Application.Custodies.GetCustodies.CustodyResponse`      -> `Custody`
 * - `Application.Custodies.GetPending.PendingCustodyResponse`  -> `PendingCustody`
 * - `Web.Api.Controllers.Custodies.AssignAssetCustodyController.RequestBody`
 * - `Web.Api.Controllers.Custodies.TransferCustodyRequest`
 */
import type { CounterpartType } from '@/modules/organization/types/counterpart-lookup.types'

/** Live `Domain.Common.CustodyKind`. */
export type CustodyKind = 'Operational' | 'Personal'

/** Live `Domain.Common.CustodySubjectType`. */
export type CustodySubjectType = 'Asset' | 'TrackedUnit' | 'MaterialQuantity'

/**
 * The `status` string on a custody row. It is SUBJECT-DEPENDENT (see
 * `GetCustodiesQueryHandler.GetStatus`): an Asset row is `Active` / `Closed`,
 * a TrackedUnit row is `Issued` / `Returned` / `Disposed`, a MaterialQuantity
 * row is `Active` / `FullyReturned`, and the server falls back to `Unknown`.
 */
export type CustodyStatus =
  'Active' | 'Closed' | 'Issued' | 'Returned' | 'Disposed' | 'FullyReturned' | 'Unknown'

/**
 * `GET /custodies` row (`CustodyResponse`).
 *
 * `holderDisplayName` is served by the live API (resolved from the counterpart
 * lookup) and is `Unknown` when the counterpart cannot be resolved; the asset
 * row itself carries no name at all, so only this row may show one.
 */
export interface Custody {
  readonly subjectType: CustodySubjectType
  readonly subjectId: string
  readonly custodyId: string
  readonly materialId: string
  readonly materialNameAr: string
  readonly materialNameEn: string | null
  readonly materialCode: string
  readonly materialKind: string
  readonly trackingType: string
  readonly serialNumber: string | null
  readonly assetNumber: string | null
  readonly warehouseId: string
  readonly warehouseName: string
  readonly holderType: CounterpartType
  readonly holderId: string
  readonly holderDisplayName: string
  readonly custodyKind: CustodyKind
  readonly issuedQuantity: number
  readonly activeQuantity: number
  readonly returnedQuantity: number
  readonly issueDocumentId: string
  readonly systemReferenceNumber: string | null
  readonly status: CustodyStatus
  readonly fromUtc: string
  readonly toUtc: string | null
  readonly rowVersion: number
}

/**
 * `GET /custodies/pending` row (`PendingCustodyResponse`).
 *
 * The pending projection carries no holder display name, no status and no
 * custody kind: the endpoint answers "Operational + Active custody rows of
 * assets issued out of this warehouse", so the kind and the status are implied
 * by the row's presence.
 */
export interface PendingCustody {
  readonly custodyId: string
  readonly assetId: string
  readonly assetNumber: string
  readonly materialId: string
  readonly holderType: CounterpartType
  readonly holderId: string
  readonly issueDocumentId: string
  readonly fromUtc: string
  readonly rowVersion: number
}

/**
 * `GET /custodies` query — the live parameters and NOTHING else.
 *
 * The server binds `holderType`, `holderId`, `materialId`, `subjectType`,
 * `status`, `warehouseId`, `page` (ONE-based) and `pageSize`. It has NO
 * `search`, NO `custodyKind` and NO sort parameter, so none may be sent.
 */
export interface ListCustodiesQuery {
  readonly holderType?: CounterpartType
  readonly holderId?: string
  readonly materialId?: string
  readonly subjectType?: CustodySubjectType
  readonly status?: string
  readonly warehouseId?: string
  readonly page?: number
  readonly pageSize?: number
}

/**
 * `GET /custodies/pending` query.
 *
 * The endpoint is WAREHOUSE-SCOPED: `GetPendingCustodiesQuery` binds a
 * non-nullable `Guid WarehouseId` and answers 404 when the warehouse is
 * unknown, so the id is required here rather than optional.
 */
export interface ListPendingCustodiesQuery {
  readonly warehouseId: string
  readonly page?: number
  readonly pageSize?: number
}

/**
 * Request body of `POST /assets/{assetId}/custody-assignment`. Verified against
 * the live controller (`Web.Api.Controllers.Custodies.AssignAssetCustodyController`)
 * on 2026-10-22: `{ employeeId, expectedCustodyRowVersion, note? }` and nothing
 * else — the asset id travels in the path, and there is no `subjectType`,
 * `custodyKind`, `holderType` or `issueDocumentId` in the body.
 *
 * `note` is omitted when the operator leaves the optional reason blank; the
 * live schema marks it `nullable: true` and never requires it.
 */
export interface AssignAssetCustodyRequest {
  readonly employeeId: string
  readonly expectedCustodyRowVersion: number
  readonly note?: string | null
}

/**
 * Request body of `POST /custodies/{custodyId}/transfer`. Verified against
 * `Web.Api.Controllers.Custodies.TransferCustodyRequest` on 2026-10-22.
 * Distinct from the assign body — transfer CLOSES the current custody row and
 * opens a NEW one for the new holder, instead of assigning a holder to an
 * asset that has none.
 *
 * `newHolderType` is the live `PartyType` vocabulary: `Employee`,
 * `OrganizationalUnit`, `Site`, `External`. The snapshot's `ExternalParty` is
 * not a member the server knows, so sending it is a 400.
 */
export interface TransferCustodyRequest {
  readonly subjectType: CustodySubjectType
  readonly newHolderType: CounterpartType
  readonly newHolderId: string
  readonly newCustodyKind: CustodyKind
  readonly expectedRowVersion: number
  readonly note?: string | null
}

/**
 * Successful personal-assignment response. The live controller answers 201
 * `ApiResponse<ResourceIdResponse>` = `{ id }` (the new custody row's id),
 * NOT the full custody row. The caller invalidates and refetches — see
 * `use-custody-queries.ts`.
 */
export interface CustodyAssignmentCreated {
  readonly id: string
}
