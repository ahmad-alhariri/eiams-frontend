import { describe, expect, it } from 'vitest'

import {
  fromReceivingInfo,
  RECEIVING_TYPE_LABELS_AR,
  receivingInfoSchema,
  RECEIVING_TYPES,
  toReceivingInfo,
} from '@/modules/receiving/schemas/receiving-info.schema'

/**
 * The draft write is `ReceivingDraftDetails(SupplierRef, SupplierInvoiceRef)`:
 * `supplierRef` is V1 FREE TEXT — the supplier NAME — and the receiving type is
 * not part of the write at all (the backend passes `ReceivingType.Supplier` for
 * every receiving draft it creates). Only the READ projection carries
 * `receivingType`, and only the detail view reads it.
 */

const SUPPLIER_NAME = 'شركة الأثاث للتوريدات'

describe('receivingInfoSchema', () => {
  it('accepts a supplier name with an optional invoice reference', () => {
    const result = receivingInfoSchema.safeParse({
      supplierRef: SUPPLIER_NAME,
      supplierInvoiceRef: 'INV-2024-001',
    })
    expect(result.success).toBe(true)
  })

  it('trims the supplier name', () => {
    const result = receivingInfoSchema.safeParse({ supplierRef: `  ${SUPPLIER_NAME}  ` })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.supplierRef).toBe(SUPPLIER_NAME)
    }
  })

  it('rejects an empty supplier name with an Arabic message', () => {
    const result = receivingInfoSchema.safeParse({ supplierRef: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('اسم المورد مطلوب.')
    }
  })

  it('rejects a whitespace-only supplier name', () => {
    const result = receivingInfoSchema.safeParse({ supplierRef: '   ' })
    expect(result.success).toBe(false)
  })

  it('enforces the contract supplier-name length (200)', () => {
    const result = receivingInfoSchema.safeParse({ supplierRef: 'م'.repeat(201) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز اسم المورد 200 محرفاً.')
    }
  })

  it('enforces the contract invoice-reference length', () => {
    const result = receivingInfoSchema.safeParse({
      supplierRef: SUPPLIER_NAME,
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
      supplierRef: SUPPLIER_NAME,
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
    expect(toReceivingInfo({ supplierRef: SUPPLIER_NAME, supplierInvoiceRef: '' })).toEqual({
      supplierRef: SUPPLIER_NAME,
    })
    expect(
      toReceivingInfo({
        supplierRef: SUPPLIER_NAME,
        supplierInvoiceRef: 'INV-7',
      }),
    ).toEqual({
      supplierRef: SUPPLIER_NAME,
      supplierInvoiceRef: 'INV-7',
    })
  })

  it('seeds the stored supplier name from a server record', () => {
    const values = fromReceivingInfo({
      supplierRef: 'EXT-SUP-001',
      supplierInvoiceRef: 'INV-20',
      receivingType: 'Supplier',
    })
    expect(values).toEqual({ supplierRef: 'EXT-SUP-001', supplierInvoiceRef: 'INV-20' })
  })

  it('defaults a missing petal to an empty supplier with no invoice reference', () => {
    expect(fromReceivingInfo(undefined)).toEqual({
      supplierRef: '',
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
    ).toEqual({ supplierRef: 'مورد', supplierInvoiceRef: undefined })
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
