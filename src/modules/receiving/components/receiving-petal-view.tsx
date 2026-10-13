import { DetailField } from '@/shared/layout/detail-field'
import type { ReceivingInfoResponse } from '@/shared/documents/types/document-wire.types'

import { receivingTypeLabelAr } from '@/modules/receiving/schemas/receiving-info.schema'

export interface ReceivingPetalViewProps {
  info: ReceivingInfoResponse
}

/**
 * Read-only ReceivingInfo petal display (e13-t06) rendered inside the shared
 * detail page's `petalSlot`. Values are server-authoritative; the invoice row
 * appears only when the server record carries a reference.
 */
export function ReceivingPetalView({ info }: ReceivingPetalViewProps) {
  const hasInvoice =
    info.supplierInvoiceRef !== undefined &&
    info.supplierInvoiceRef !== null &&
    info.supplierInvoiceRef !== ''
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <DetailField label="نوع الاستلام">{receivingTypeLabelAr(info.receivingType)}</DetailField>
      <DetailField label="المورد">{info.supplierRef}</DetailField>
      {hasInvoice ? (
        <DetailField label="رقم فاتورة المورد" ltr>
          {info.supplierInvoiceRef}
        </DetailField>
      ) : null}
    </dl>
  )
}
