import { describe, expect, it } from 'vitest'

import {
  fromReceivingInfo,
  RECEIVING_TYPE_LABELS_AR,
  receivingInfoSchema,
  RECEIVING_TYPES,
  toReceivingInfo,
} from '@/modules/receiving/schemas/receiving-info.schema'

/**
 * The live write is `ReceivingDraftDetails(SupplierPartyId, SupplierInvoiceRef)`:
 * the supplier is an EXTERNAL PARTY ID, not a free-text reference, and the
 * receiving type is not part of the write at all — the backend passes
 * `ReceivingType.Supplier` for every receiving draft it creates. Only the READ
 * projection carries `receivingType`, and only the detail view reads it.
 */

const SUPPLIER_PARTY_ID = '77777777-7777-4777-8777-777777777777'

describe('receivingInfoSchema', () => {
  it('accepts a supplier party id with an optional invoice reference', () => {
    const result = receivingInfoSchema.safeParse({
      supplierPartyId: SUPPLIER_PARTY_ID,
      supplierInvoiceRef: 'INV-2024-001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty supplier party id with an Arabic message', () => {
    const result = receivingInfoSchema.safeParse({ supplierPartyId: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار مورد صالح من القائمة.')
    }
  })

  it('rejects a free-text supplier name, because the route binds a UUID', () => {
    const result = receivingInfoSchema.safeParse({ supplierPartyId: '   ' })
    expect(result.success).toBe(false)
  })

  it('enforces the contract invoice-reference length', () => {
    const result = receivingInfoSchema.safeParse({
      supplierPartyId: SUPPLIER_PARTY_ID,
      supplierInvoiceRef: 'ف'.repeat(101),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual([
        'supplierInvoiceRef',
      ])
    }
  })

  it('treats an empty invoice reference as omitted', () => {
    const result = receivingInfoSchema.safeParse({
      supplierPartyId: SUPPLIER_PARTY_ID,
      supplierInvoiceRef: '   ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.supplierInvoiceRef).toBe('')
    }
  })
})

describe('toReceivingInfo / fromReceivingInfo', () => {
  it('maps form values to the contract shape, dropping the empty invoice reference', () => {
    expect(toReceivingInfo({ supplierPartyId: SUPPLIER_PARTY_ID, supplierInvoiceRef: '' })).toEqual(
      { supplierPartyId: SUPPLIER_PARTY_ID },
    )
    expect(
      toReceivingInfo({
        supplierPartyId: SUPPLIER_PARTY_ID,
        supplierInvoiceRef: 'INV-7',
      }),
    ).toEqual({
      supplierPartyId: SUPPLIER_PARTY_ID,
      supplierInvoiceRef: 'INV-7',
    })
  })

  it('starts the supplier empty from a server record: the read projection carries no party id', () => {
    const values = fromReceivingInfo({
      supplierRef: 'EXT-SUP-001',
      supplierInvoiceRef: 'INV-20',
      receivingType: 'Supplier',
    })
    expect(values).toEqual({ supplierPartyId: '', supplierInvoiceRef: 'INV-20' })
  })

  it('defaults a missing petal to an empty supplier with no invoice reference', () => {
    expect(fromReceivingInfo(undefined)).toEqual({
      supplierPartyId: '',
      supplierInvoiceRef: undefined,
    })
  })

  it('treats a null invoice reference as absent', () => {
    expect(
      fromReceivingInfo({
        supplierRef: 'مورد',
        supplierInvoiceRef: null,
        receivingType: 'Transfer',
      }),
    ).toEqual({ supplierPartyId: '', supplierInvoiceRef: undefined })
  })

  it('labels every read-side receiving type in Arabic', () => {
    expect(RECEIVING_TYPES).toEqual(['Supplier', 'Transfer', 'Return'])
    expect(RECEIVING_TYPE_LABELS_AR).toMatchObject({
      Supplier: 'توريد من مورد',
      Transfer: 'تحويل من مستودع',
      Return: 'إرجاع بضاعة',
    })
  })
})
