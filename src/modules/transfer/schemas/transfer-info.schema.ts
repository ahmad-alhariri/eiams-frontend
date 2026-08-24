import { z } from 'zod'

import type { TransferInfo } from '@/shared/types/generated/eiams-v1'

/**
 * 500-char cap on `transferReason` is presentation-level only — schema.md
 * types it as an open text column; the cap matches sibling petals' VARCHAR
 * caps and keeps the reason box readable in the UI.
 */
const TRANSFER_REASON_MAX_LENGTH = 500

/**
 * TransferInfo petal schema (e17-t01 / contract `TransferInfo`): the
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
 * Seeds form values from a server record (edit mode). A missing petal defaults
 * to blank fields — a fresh transfer draft whose empty destination fails
 * validation until the user picks a warehouse.
 */
export function fromTransferInfo(info?: TransferInfo | null): TransferInfoFormValues {
  if (info === undefined || info === null) {
    return {
      destinationWarehouseId: '',
      transferReason: '',
    }
  }
  return {
    destinationWarehouseId: info.destinationWarehouseId,
    transferReason: info.transferReason,
  }
}

/**
 * Maps form values to the contract `TransferInfo`, trimming the reason.
 *
 * `destinationWarehouseName` handling (e17-t01 decision, mirrors e16-t01):
 * the dev mock persists `transferInfo` verbatim, so whatever the client sends
 * comes back — the UI must therefore always pass the selected option's name
 * here when one was chosen. The production server derives the name from
 * `destination_warehouse_id` on persistence, so the `''` default is a safe
 * placeholder whenever no option name exists.
 */
export function toTransferInfo(
  values: TransferInfoFormValues,
  destinationWarehouseName?: string,
): TransferInfo {
  return {
    destinationWarehouseId: values.destinationWarehouseId,
    destinationWarehouseName: destinationWarehouseName ?? '',
    transferReason: values.transferReason.trim(),
  }
}

/**
 * The petal group of the transfer document form (header + lines + petal).
 * `destinationWarehouseName` rides alongside the petal as a selection-time
 * sibling (e16-t01 pattern): the mock persists the petal verbatim, so the
 * chosen warehouse's display name must be captured when picked.
 */
export interface TransferPetalContainer {
  petal: {
    transferInfo: z.infer<typeof transferInfoSchema>
    destinationWarehouseName: string
  }
}

/** Flattens the page's petal group into the contract `TransferInfo`. */
export function buildTransferPetal(values: TransferPetalContainer['petal']): TransferInfo {
  return toTransferInfo(
    values.transferInfo,
    values.destinationWarehouseName === '' ? undefined : values.destinationWarehouseName,
  )
}
