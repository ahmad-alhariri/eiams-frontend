import { z } from 'zod'

import type { ReceivingInfo } from '@/shared/types/generated/eiams-v1'

/**
 * ReceivingInfo petal capture (e13-t01). The contract types `receivingType`
 * as a plain string (schema.md: VARCHAR(30)); the form vocabulary follows the
 * PRD 12.2 trio (Supplier / Transfer / Return), while validation stays
 * contract-shaped so server records carrying other values (e.g. the dev-mock
 * `Purchase` seed) remain editable and renderable.
 */

/** PRD 12.2 receiving types the create form offers. */
export const RECEIVING_TYPES = ['Supplier', 'Transfer', 'Return'] as const

export type ReceivingType = (typeof RECEIVING_TYPES)[number]

export const RECEIVING_TYPE_LABELS_AR: Readonly<Record<ReceivingType, string>> = {
  Supplier: 'توريد من مورد',
  Transfer: 'تحويل من مستودع',
  Return: 'إرجاع بضاعة',
}

/**
 * Arabic label for a server `receivingType` value (e13-t06). The PRD 12.2 trio
 * maps to its label; unknown contract values (e.g. the dev-mock `Purchase`
 * seed) render as-is so foreign records stay readable.
 */
export function receivingTypeLabelAr(receivingType: string): string {
  return RECEIVING_TYPE_LABELS_AR[receivingType as ReceivingType] ?? receivingType
}

/** schema.md: `supplier_ref` VARCHAR(200), `supplier_invoice_ref` VARCHAR(100). */
const SUPPLIER_REF_MAX_LENGTH = 200
const SUPPLIER_INVOICE_REF_MAX_LENGTH = 100

export const receivingInfoSchema = z.object({
  receivingType: z.string().min(1, 'يجب اختيار نوع الاستلام.'),
  supplierRef: z
    .string()
    .trim()
    .min(1, 'يجب إدخال اسم أو مرجع المورد.')
    .max(SUPPLIER_REF_MAX_LENGTH, `يجب ألا يتجاوز مرجع المورد ${SUPPLIER_REF_MAX_LENGTH} محرفاً.`),
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
 * Maps form values to the contract `ReceivingInfo`. An empty invoice
 * reference is omitted (the contract marks it optional/nullable), and the
 * supplier reference is trimmed.
 */
export function toReceivingInfo(values: ReceivingInfoFormValues): ReceivingInfo {
  const supplierInvoiceRef = values.supplierInvoiceRef?.trim()
  return {
    receivingType: values.receivingType,
    supplierRef: values.supplierRef.trim(),
    ...(supplierInvoiceRef === undefined || supplierInvoiceRef === ''
      ? {}
      : { supplierInvoiceRef }),
  }
}

/**
 * Seeds form values from a server record (edit mode). Missing petals default
 * to the Supplier type with empty references — a fresh receiving draft.
 */
export function fromReceivingInfo(info: ReceivingInfo | undefined): ReceivingInfoFormValues {
  if (info === undefined) {
    return { receivingType: 'Supplier', supplierRef: '', supplierInvoiceRef: undefined }
  }
  return {
    receivingType: info.receivingType,
    supplierRef: info.supplierRef,
    supplierInvoiceRef: info.supplierInvoiceRef ?? undefined,
  }
}
