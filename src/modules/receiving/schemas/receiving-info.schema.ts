import { z } from 'zod'

import type { ReceivingDraftDetails } from '@/shared/documents/types/document-wire.types'
import type { ReceivingInfoResponse } from '@/shared/documents/types/document-wire.types'

/**
 * ReceivingInfo petal capture (e13-t01).
 *
 * The draft write is `ReceivingDraftDetails(SupplierRef, SupplierInvoiceRef)`:
 * `supplierRef` is V1 FREE TEXT — the supplier NAME, typed or picked from the
 * suggestions — and the receiving type is NOT part of the write at all:
 * `CompleteWarehouseDocumentDraftCommandHandler` passes
 * `ReceivingType.Supplier` for every receiving draft it creates. The read side
 * does return `receivingType` (`ReceivingInfoResponse`), so the label vocabulary
 * below still serves the detail view.
 */

/** PRD 12.2 receiving types the read projection may carry. */
export const RECEIVING_TYPES = ['Supplier', 'Transfer', 'Return'] as const

export type ReceivingType = (typeof RECEIVING_TYPES)[number]

export const RECEIVING_TYPE_LABELS_AR: Readonly<Record<ReceivingType, string>> = {
  Supplier: 'توريد من مورد',
  Transfer: 'تحويل من مستودع',
  Return: 'إرجاع بضاعة',
}

/**
 * Arabic label for a server `receivingType` value (e13-t06). The PRD 12.2 trio
 * maps to its label; unknown contract values render as-is so foreign records
 * stay readable.
 */
export function receivingTypeLabelAr(receivingType: string): string {
  return RECEIVING_TYPE_LABELS_AR[receivingType as ReceivingType] ?? receivingType
}

/** schema.md: `supplier_invoice_ref` VARCHAR(100). */
const SUPPLIER_INVOICE_REF_MAX_LENGTH = 100
/** schema.md: `supplier_ref` VARCHAR(200). */
const SUPPLIER_REF_MAX_LENGTH = 200

export const receivingInfoSchema = z.object({
  /** The supplier NAME, captured as V1 free text; suggestions only aid typing. */
  supplierRef: z
    .string()
    .trim()
    .min(1, 'اسم المورد مطلوب.')
    .max(SUPPLIER_REF_MAX_LENGTH, `يجب ألا يتجاوز اسم المورد ${SUPPLIER_REF_MAX_LENGTH} محرفاً.`),
  supplierInvoiceRef: z
    .string()
    .trim()
    .max(
      SUPPLIER_INVOICE_REF_MAX_LENGTH,
      `يجب ألا يتجاوز رقم فاتورة المورد ${SUPPLIER_INVOICE_REF_MAX_LENGTH} محرفاً.`,
    )
    .optional(),
})

export type ReceivingInfoFormValues = z.infer<typeof receivingInfoSchema>

/**
 * Maps form values to the wire `ReceivingDraftDetails`. An empty invoice
 * reference is omitted (the command marks it optional/nullable).
 */
export function toReceivingInfo(values: ReceivingInfoFormValues): ReceivingDraftDetails {
  const supplierInvoiceRef = values.supplierInvoiceRef?.trim()
  return {
    supplierRef: values.supplierRef,
    ...(supplierInvoiceRef === undefined || supplierInvoiceRef === ''
      ? {}
      : { supplierInvoiceRef }),
  }
}

/**
 * Seeds form values from a server record (edit mode). The read projection
 * carries the stored supplier NAME, so it seeds directly.
 */
export function fromReceivingInfo(
  info: ReceivingInfoResponse | undefined,
): ReceivingInfoFormValues {
  if (info === undefined) {
    return { supplierRef: '', supplierInvoiceRef: undefined }
  }
  return {
    supplierRef: info.supplierRef ?? '',
    supplierInvoiceRef: info.supplierInvoiceRef ?? undefined,
  }
}
