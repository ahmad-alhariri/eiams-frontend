import { describe, expect, it } from 'vitest'

import { createMaterial } from '@/test/msw/factories'
import {
  ASSET_LINE_DOCUMENT_TYPES,
  assetInputSchema,
  assetLineSchema,
  assetLinesSchema,
  createEmptyAssetInput,
  createEmptyAssetLine,
  isAssetMaterial,
  toAssetLineInputs,
  type AssetKindMaterial,
  type AssetLineValues,
} from '@/shared/documents/schemas/document-lines.schemas'

const MATERIAL_ID = '00000000-0000-4000-8000-000000000024'

function validLine(overrides: Partial<AssetLineValues> = {}): AssetLineValues {
  return {
    materialId: MATERIAL_ID,
    materialNameAr: 'طابعة ليزر',
    materialDomainId: '00000000-0000-4000-8000-000000000020',
    baseUnitId: '00000000-0000-4000-8000-000000000023',
    baseUnitNameAr: 'قطعة',
    quantity: 1,
    assetInputs: [{}],
    ...overrides,
  }
}

describe('asset-line capture schema (e12-t05)', () => {
  it('createEmptyAssetLine seeds one fully-optional empty unit and a visible-incomplete material', () => {
    const line = createEmptyAssetLine()
    expect(line).toEqual({
      materialId: '',
      materialNameAr: '',
      materialDomainId: '',
      quantity: 0,
      assetInputs: [{}],
    })
    expect(line.assetInputs).toHaveLength(1)
    expect(createEmptyAssetInput()).toEqual({})
  })

  it('declares the document types that register new assets (Receiving + Opening)', () => {
    expect(ASSET_LINE_DOCUMENT_TYPES).toEqual(['Receiving', 'Opening'])
  })

  it('passes a line whose quantity equals its unit count and keeps every input', () => {
    const input = validLine({
      quantity: 2,
      assetInputs: [
        { assetNumber: 'A-1001' },
        { serialNumber: 'SN-9001', assetNumber: 'A-1002', acquisitionDate: '2024-01-15' },
      ],
    })
    const result = assetLineSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.assetInputs).toHaveLength(2)
      expect(result.data.assetInputs[1]).toEqual({
        assetNumber: 'A-1002',
        serialNumber: 'SN-9001',
        acquisitionDate: '2024-01-15',
      })
    }
  })

  it('rejects a quantity that disagrees with the unit count with an Arabic message', () => {
    const result = assetLineSchema.safeParse(validLine({ quantity: 2, assetInputs: [{}, {}, {}] }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'يجب أن تساوي الكمية عدد وحدات الأصل المسجلة (وحدة لكل أصل).',
      )
    }
  })

  it('accepts omitted, empty, and whitespace asset numbers in draft and trims input', () => {
    expect(assetLineSchema.safeParse(validLine()).success).toBe(true)
    expect(
      assetLineSchema.safeParse(validLine({ assetInputs: [{ assetNumber: '' }] })).success,
    ).toBe(true)
    const result = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ assetNumber: '  A-100  ' }] }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.assetInputs[0]?.assetNumber).toBe('A-100')
    }
  })

  it('rejects an asset number longer than VARCHAR(100) with an Arabic message', () => {
    const result = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ assetNumber: 'A'.repeat(101) }] }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز رقم الأصل 100 محرفاً.')
    }
  })

  it('rejects a serial number longer than 100 chars with an Arabic message', () => {
    const result = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ serialNumber: 'S'.repeat(101) }] }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز الرقم التسلسلي 100 محرفاً.')
    }
  })

  it('accepts a 100-char boundary serial number', () => {
    expect(
      assetLineSchema.safeParse(validLine({ assetInputs: [{ serialNumber: 'S'.repeat(100) }] }))
        .success,
    ).toBe(true)
  })

  it('rejects non-calendar dates with Arabic messages and keeps empty dates as cleared optionals', () => {
    for (const acquisitionDate of ['2024-13-01', '2024-02-30', '20/01/2024', 'not-a-date']) {
      const result = assetLineSchema.safeParse(validLine({ assetInputs: [{ acquisitionDate }] }))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('تاريخ حصول غير صالح؛ استخدم صيغة YYYY-MM-DD.')
      }
    }
    const warrantyResult = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ warrantyExpiry: '01-2024-05' }] }),
    )
    expect(warrantyResult.success).toBe(false)
    if (!warrantyResult.success) {
      expect(warrantyResult.error.issues[0]?.message).toBe(
        'تاريخ انتهاء ضمان غير صالح؛ استخدم صيغة YYYY-MM-DD.',
      )
    }
    const emptyDates = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ acquisitionDate: '', warrantyExpiry: '' }] }),
    )
    expect(emptyDates.success).toBe(true)
    if (emptyDates.success) {
      expect(emptyDates.data.assetInputs[0]?.acquisitionDate).toBeUndefined()
      expect(emptyDates.data.assetInputs[0]?.warrantyExpiry).toBeUndefined()
    }
    expect(assetInputSchema.safeParse({ acquisitionDate: '2024-01-31' }).success).toBe(true)
  })

  it('maps asset lines to the request contract: snapshots dropped, empty optionals omitted, one input per unit kept', () => {
    const lines: AssetLineValues[] = [
      validLine({
        lineId: '00000000-0000-4000-8000-000000000201',
        quantity: 2,
        assetInputs: [
          { assetNumber: '  A-1001  ', serialNumber: '', acquisitionDate: '', warrantyExpiry: '' },
          {
            assetNumber: 'A-1002',
            serialNumber: 'SN-9002',
            acquisitionDate: '2024-03-01',
            warrantyExpiry: '2027-03-01',
          },
        ],
      }),
      validLine({
        quantity: 1,
        assetInputs: [createEmptyAssetInput()],
      }),
    ]
    expect(toAssetLineInputs(lines)).toEqual([
      {
        lineId: '00000000-0000-4000-8000-000000000201',
        materialId: MATERIAL_ID,
        quantity: 2,
        assetInputs: [
          { assetNumber: 'A-1001' },
          {
            assetNumber: 'A-1002',
            serialNumber: 'SN-9002',
            acquisitionDate: '2024-03-01',
            warrantyExpiry: '2027-03-01',
          },
        ],
      },
      { materialId: MATERIAL_ID, quantity: 1, assetInputs: [{}] },
    ])
  })

  it('validates the asset-line container: at least one line and no repeated materials', () => {
    const empty = assetLinesSchema.safeParse([])
    expect(empty.success).toBe(false)
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe('أضف بنداً واحداً على الأقل.')
    }
    const duplicated = assetLinesSchema.safeParse([validLine(), validLine()])
    expect(duplicated.success).toBe(false)
    if (!duplicated.success) {
      expect(duplicated.error.issues[0]?.message).toBe('لا يجوز تكرار المادة نفسها في أكثر من بند.')
    }
    const distinct = assetLinesSchema.safeParse([
      validLine(),
      validLine({ materialId: '00000000-0000-4000-8000-000000000061' }),
    ])
    expect(distinct.success).toBe(true)
  })

  it('discriminates Asset-kind materials for row partitioning', () => {
    const asset = createMaterial({
      materialKind: 'Asset',
      requiresAssetNumber: true,
      trackingType: 'Serial',
    })
    const durable = createMaterial({ materialKind: 'Durable', trackingType: 'Serial' })
    const consumable = createMaterial({ materialKind: 'Consumable' })
    expect(isAssetMaterial(asset)).toBe(true)
    expect(isAssetMaterial(durable)).toBe(false)
    expect(isAssetMaterial(consumable)).toBe(false)
    if (isAssetMaterial(asset)) {
      const narrowed: AssetKindMaterial = asset
      expect(narrowed.requiresAssetNumber).toBe(true)
      expect(narrowed.trackingType).toBe('Serial')
    }
  })
})
