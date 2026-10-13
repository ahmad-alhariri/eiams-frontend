import { describe, expect, it } from 'vitest'

import type { CompleteDraftLine } from '@/shared/documents/types/document-wire.types'

import {
  PAPER_DOCUMENT_NUMBER_PATTERN,
  PAPER_DOCUMENT_YEAR_MAX,
  PAPER_DOCUMENT_YEAR_MIN,
  buildCompleteDraftRequest,
  documentHeaderSchema,
  type DocumentHeaderValues,
} from './document-header-form'

const CURRENT_YEAR = new Date().getFullYear()

const WAREHOUSE_ID = '11111111-1111-4111-8111-111111111111'
const PAPER_DOCUMENT_NUMBER = '2024/000123'

function validHeader(overrides: Partial<DocumentHeaderValues> = {}): DocumentHeaderValues {
  return {
    warehouseId: WAREHOUSE_ID,
    paperDocumentNumber: PAPER_DOCUMENT_NUMBER,
    paperDocumentYear: CURRENT_YEAR,
    ...overrides,
  }
}

function lines(): CompleteDraftLine[] {
  return [
    {
      materialId: '22222222-2222-4222-8222-222222222222',
      quantity: 5,
    },
    {
      materialId: '33333333-3333-4333-8333-333333333333',
      quantity: 3,
    },
  ]
}

describe('documentHeaderSchema', () => {
  it('accepts a complete header and trims the paper number', () => {
    const result = documentHeaderSchema.safeParse({
      ...validHeader(),
      paperDocumentNumber: '  2024/000123  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validHeader())
    }
  })

  it('accepts a paper number without the slash section', () => {
    const result = documentHeaderSchema.safeParse(validHeader({ paperDocumentNumber: '42' }))
    expect(result.success).toBe(true)
  })

  it.each([
    ['', 'رقم المستند الورقي مطلوب.'],
    ['   ', 'رقم المستند الورقي مطلوب.'],
  ])('rejects an empty paper number %j with the Arabic message', (paperDocumentNumber, message) => {
    const result = documentHeaderSchema.safeParse(validHeader({ paperDocumentNumber }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message)
    }
  })

  it('rejects a paper number that violates the digits pattern', () => {
    const result = documentHeaderSchema.safeParse(validHeader({ paperDocumentNumber: 'abc/123' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'صيغة غير صحيحة؛ استخدم أرقاماً إنجليزية فقط مثل 2024/000123.',
      )
    }
  })

  it.each([['2024/0001234567890'], ['2024/1234567890123']])(
    'rejects an overlong paper number %j',
    (paperDocumentNumber) => {
      const result = documentHeaderSchema.safeParse(validHeader({ paperDocumentNumber }))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز رقم المستند الورقي 15 محرفاً.')
      }
    },
  )

  it('rejects a missing warehouseId with the Arabic message', () => {
    const result = documentHeaderSchema.safeParse(validHeader({ warehouseId: '' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار مستودع صالح من القائمة.')
    }
  })

  it('rejects a non-uuid warehouseId', () => {
    const result = documentHeaderSchema.safeParse(validHeader({ warehouseId: 'not-a-uuid' }))
    expect(result.success).toBe(false)
  })

  it('rejects a year one below the minimum bound with the Arabic message', () => {
    const result = documentHeaderSchema.safeParse(
      validHeader({ paperDocumentYear: PAPER_DOCUMENT_YEAR_MIN - 1 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        `يجب ألا تقل السنة الورقية عن ${PAPER_DOCUMENT_YEAR_MIN}.`,
      )
    }
  })

  it('rejects a year one above the maximum bound with the Arabic message', () => {
    const result = documentHeaderSchema.safeParse(
      validHeader({ paperDocumentYear: PAPER_DOCUMENT_YEAR_MAX + 1 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        `يجب ألا تتجاوز السنة الورقية ${PAPER_DOCUMENT_YEAR_MAX}.`,
      )
    }
  })

  it('rejects a missing year with the Arabic message', () => {
    const header: Partial<DocumentHeaderValues> = validHeader()
    delete header.paperDocumentYear
    const result = documentHeaderSchema.safeParse(header)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب إدخال سنة صحيحة.')
    }
  })

  it('rejects a fractional year with the Arabic message', () => {
    const result = documentHeaderSchema.safeParse(
      validHeader({ paperDocumentYear: CURRENT_YEAR + 0.5 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب إدخال سنة صحيحة.')
    }
  })

  it('accepts both bounds of the paper-year range', () => {
    expect(
      documentHeaderSchema.safeParse(validHeader({ paperDocumentYear: PAPER_DOCUMENT_YEAR_MIN }))
        .success,
    ).toBe(true)
    expect(
      documentHeaderSchema.safeParse(validHeader({ paperDocumentYear: PAPER_DOCUMENT_YEAR_MAX }))
        .success,
    ).toBe(true)
  })

  it('exports a pattern that only matches digit-only paper numbers', () => {
    expect('2024/000123'.match(PAPER_DOCUMENT_NUMBER_PATTERN)).not.toBeNull()
    expect('7'.match(PAPER_DOCUMENT_NUMBER_PATTERN)).not.toBeNull()
    expect('abc/123'.match(PAPER_DOCUMENT_NUMBER_PATTERN)).toBeNull()
  })
})

describe('buildCompleteDraftRequest', () => {
  it('maps an Issue document to issueTo and nothing else', () => {
    const issueTo = {
      issueReason: 'صرف داخلي',
      recipientId: '44444444-4444-4444-8444-444444444444',
      recipientType: 'OrganizationalUnit' as const,
    }
    const request = buildCompleteDraftRequest({
      documentType: 'Issue',
      header: validHeader(),
      lines: lines(),
      petals: { issueTo },
    })

    expect(request.documentType).toBe('Issue')
    expect(request.issueTo).toEqual(issueTo)
    expect(request.lines).toEqual(lines())
    expect('receivingInfo' in request).toBe(false)
    expect('transferInfo' in request).toBe(false)
    expect('returnInfo' in request).toBe(false)
  })

  it('maps a Receiving document to receivingInfo', () => {
    const receivingInfo = {
      supplierInvoiceRef: 'INV-2024-01',
      supplierPartyId: '77777777-7777-4777-8777-777777777777',
    }
    const request = buildCompleteDraftRequest({
      documentType: 'Receiving',
      header: validHeader(),
      lines: lines(),
      petals: { receivingInfo },
    })

    expect(request.receivingInfo).toEqual(receivingInfo)
    expect('issueTo' in request).toBe(false)
  })

  it('maps a Transfer document to transferInfo', () => {
    const transferInfo = {
      destinationWarehouseId: '55555555-5555-4555-8555-555555555555',
      transferReason: 'إعادة توزيع',
    }
    const request = buildCompleteDraftRequest({
      documentType: 'Transfer',
      header: validHeader(),
      lines: lines(),
      petals: { transferInfo },
    })

    expect(request.transferInfo).toEqual(transferInfo)
    expect('issueTo' in request).toBe(false)
    expect('returnInfo' in request).toBe(false)
  })

  it('maps a Return document to returnInfo', () => {
    const returnInfo = {
      originalIssueDocumentId: '66666666-6666-4666-8666-666666666666',
      returnReason: 'زيادة عن الحاجة',
    }
    const request = buildCompleteDraftRequest({
      documentType: 'Return',
      header: validHeader(),
      lines: lines(),
      petals: { returnInfo },
    })

    expect(request.returnInfo).toEqual(returnInfo)
    expect('issueTo' in request).toBe(false)
    expect('transferInfo' in request).toBe(false)
  })

  it('maps an Adjustment document to adjustmentInfo', () => {
    const adjustmentInfo = {
      adjustmentKind: 'DirectCorrection',
      reason: 'تصحيح فرق جرد',
    }
    const request = buildCompleteDraftRequest({
      documentType: 'Adjustment',
      header: validHeader(),
      lines: lines(),
      petals: { adjustmentInfo },
    })

    expect(request.adjustmentInfo).toEqual(adjustmentInfo)
    expect('issueTo' in request).toBe(false)
  })

  it('maps an Opening document to no petal field', () => {
    const request = buildCompleteDraftRequest({
      documentType: 'Opening',
      header: validHeader(),
      lines: lines(),
      petals: {},
    })

    expect(request.documentType).toBe('Opening')
    expect('issueTo' in request).toBe(false)
    expect('receivingInfo' in request).toBe(false)
    expect('transferInfo' in request).toBe(false)
    expect('returnInfo' in request).toBe(false)
    expect('adjustmentInfo' in request).toBe(false)
  })

  it('carries the warehouse through and deliberately leaves the paper reference out', () => {
    // The live `complete-draft` command has no slot for the paper number/year:
    // a validated header field that reaches no server state would be a lie, so
    // it is written afterwards through `PUT /{id}/paper-reference`.
    const request = buildCompleteDraftRequest({
      documentType: 'Opening',
      header: validHeader(),
      lines: [],
      petals: {},
    })

    expect(request.warehouseId).toBe(WAREHOUSE_ID)
    expect('paperDocumentNumber' in request).toBe(false)
    expect('paperDocumentYear' in request).toBe(false)
  })

  it('passes asset-capture lines through untouched', () => {
    const assetLines: CompleteDraftLine[] = [
      {
        materialId: '88888888-8888-4888-8888-888888888888',
        quantity: 2,
        assetInputs: [{ assetNumber: 'A-1001' }, { serialNumber: 'SN-9002' }],
      },
    ]
    const request = buildCompleteDraftRequest({
      documentType: 'Receiving',
      header: validHeader(),
      lines: assetLines,
      petals: { receivingInfo: { supplierPartyId: WAREHOUSE_ID } },
    })

    expect(request.lines).toEqual(assetLines)
  })
})
