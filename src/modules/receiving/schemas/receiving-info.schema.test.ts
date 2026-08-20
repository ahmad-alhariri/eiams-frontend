import { describe, expect, it } from 'vitest'

import {
  fromReceivingInfo,
  RECEIVING_TYPE_LABELS_AR,
  receivingInfoSchema,
  RECEIVING_TYPES,
  toReceivingInfo,
} from '@/modules/receiving/schemas/receiving-info.schema'

describe('receivingInfoSchema', () => {
  it('accepts the PRD receiving-type trio with a supplier reference', () => {
    for (const receivingType of RECEIVING_TYPES) {
      const result = receivingInfoSchema.safeParse({
        receivingType,
        supplierRef: 'مورد الشام',
        supplierInvoiceRef: 'INV-2024-001',
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects an empty receiving type with an Arabic message', () => {
    const result = receivingInfoSchema.safeParse({
      receivingType: '',
      supplierRef: 'مورد الشام',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار نوع الاستلام.')
    }
  })

  it('rejects a blank supplier reference with an Arabic message', () => {
    const result = receivingInfoSchema.safeParse({
      receivingType: 'Supplier',
      supplierRef: '   ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب إدخال اسم أو مرجع المورد.')
    }
  })

  it('enforces the contract string lengths', () => {
    const result = receivingInfoSchema.safeParse({
      receivingType: 'Supplier',
      supplierRef: 'م'.repeat(201),
      supplierInvoiceRef: 'ف'.repeat(101),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['supplierRef', 'supplierInvoiceRef']),
      )
    }
  })

  it('treats an empty invoice reference as omitted', () => {
    const result = receivingInfoSchema.safeParse({
      receivingType: 'Transfer',
      supplierRef: '  مورد الشام  ',
      supplierInvoiceRef: '   ',
    })
    expect(result.success).toBe(true)
  })
})

describe('toReceivingInfo / fromReceivingInfo', () => {
  it('maps form values to the contract shape, trimming and dropping the empty invoice reference', () => {
    expect(
      toReceivingInfo({
        receivingType: 'Supplier',
        supplierRef: '  مورد الشام  ',
        supplierInvoiceRef: '',
      }),
    ).toEqual({ receivingType: 'Supplier', supplierRef: 'مورد الشام' })
    expect(
      toReceivingInfo({
        receivingType: 'Return',
        supplierRef: 'مورد النور',
        supplierInvoiceRef: 'INV-7',
      }),
    ).toEqual({
      receivingType: 'Return',
      supplierRef: 'مورد النور',
      supplierInvoiceRef: 'INV-7',
    })
  })

  it('round-trips a server record through the form values', () => {
    const server = {
      receivingType: 'Purchase',
      supplierRef: 'EXT-SUP-001',
      supplierInvoiceRef: 'INV-20',
    }
    const values = fromReceivingInfo(server)
    expect(values).toEqual({
      receivingType: 'Purchase',
      supplierRef: 'EXT-SUP-001',
      supplierInvoiceRef: 'INV-20',
    })
    expect(toReceivingInfo(values)).toEqual(server)
  })

  it('defaults a missing petal to a fresh Supplier draft', () => {
    expect(fromReceivingInfo(undefined)).toEqual({
      receivingType: 'Supplier',
      supplierRef: '',
      supplierInvoiceRef: undefined,
    })
  })

  it('treats a null invoice reference as absent', () => {
    expect(
      fromReceivingInfo({
        receivingType: 'Transfer',
        supplierRef: 'مورد',
        supplierInvoiceRef: null,
      }),
    ).toEqual({ receivingType: 'Transfer', supplierRef: 'مورد', supplierInvoiceRef: undefined })
  })

  it('labels every receiving type in Arabic', () => {
    expect(RECEIVING_TYPE_LABELS_AR).toMatchObject({
      Supplier: 'توريد من مورد',
      Transfer: 'تحويل من مستودع',
      Return: 'إرجاع بضاعة',
    })
  })
})
