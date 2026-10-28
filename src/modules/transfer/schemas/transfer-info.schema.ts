import { z } from 'zod'

import type { TransferDraftDetails } from '@/shared/documents/types/document-wire.types'

/**
 * 200-char cap on `transferReason` is the LIVE backend's own cap, not a
 * presentation choice: `Domain/TransferInfos/TransferInfo.cs` rejects a
 * trimmed reason that is empty or longer than 200 characters
 * (`TransferInfoErrors.TransferReasonInvalid`). The sibling issue petal has
 * the same cap (`Domain/IssueTos/IssueTo.cs`).
 */
export const TRANSFER_REASON_MAX_LENGTH = 200

/**
 * TransferInfo petal schema (e17-t01 / live `TransferDraftDetails`): the
 * destination warehouse is mandatory and must come from the scoped picker
 * (uuid), with a mandatory Arabic reason for the audit trail.
 */
export const transferInfoSchema = z.object({
  destinationWarehouseId: z.string().uuid('يجب اختيار مستودع الوجهة من القائمة.'),
  transferReason: z
    .string()
    .trim()
    .min(1, 'يجب إدخال سبب التحويل.')
    .max(
      TRANSFER_REASON_MAX_LENGTH,
      `يجب ألا يتجاوز سبب التحويل ${TRANSFER_REASON_MAX_LENGTH} محرفاً.`,
    ),
})

export type TransferInfoFormValues = z.infer<typeof transferInfoSchema>

/**
 * Maps form values to the live `TransferDraftDetails` petal, trimming the
 * reason.
 *
 * The live write body is `{ destinationWarehouseId, transferReason }` and
 * nothing else: `Application.WarehouseDocuments.CompleteDraft.TransferDraftDetails`,
 * mirrored by `Web.Api.Controllers.TransferInfos.UpsertTransferInfoController.RequestBody`
 * (the same two members plus `expectedRowVersion`). The frozen snapshot's
 * `destinationWarehouseName` is gone — the live server never accepts it on a
 * write and never serves it on a read
 * (`WarehouseDocumentDetailsResponse.TransferInfoResponse` carries the id
 * alone), so the client had nothing to send and nothing to receive.
 */
export function toTransferInfo(values: TransferInfoFormValues): TransferDraftDetails {
  return {
    destinationWarehouseId: values.destinationWarehouseId,
    transferReason: values.transferReason.trim(),
  }
}

/**
 * The petal group of the transfer document form (header + lines + petal).
 *
 * There is no selection-time display-name sibling: the live petal carries the
 * destination warehouse as an ID, so capturing a name would be state nothing
 * ever reads.
 */
export interface TransferPetalContainer {
  petal: {
    transferInfo: z.infer<typeof transferInfoSchema>
  }
}

/** The petal group of the transfer document form (header + lines + petal). */
export const transferPetalFormSchema = z.object({
  petal: z.object({
    transferInfo: transferInfoSchema,
  }),
})

export type TransferPetalFormValues = z.infer<typeof transferPetalFormSchema>

/** Flattens the page's petal group into the live `TransferDraftDetails`. */
export function buildTransferPetal(values: TransferPetalContainer['petal']): TransferDraftDetails {
  return toTransferInfo(values.transferInfo)
}
