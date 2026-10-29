import { describe, expect, it } from 'vitest'

import { createMaterial } from '@/test/msw/factories'
import type { Material } from '@/modules/catalog/types/catalog.types'
import {
  ASSET_LINE_DOCUMENT_TYPES,
  assetInputSchema,
  assetLineSchema,
  assetLinesSchema,
  createEmptyAssetInput,
  createEmptyAssetLine,
  isAssetMaterial,
  toCompleteDraftAssetLines,
  type AssetLineValues,
} from '@/shared/documents/schemas/document-lines.schemas'
import {
  parseSerialList,
  serialsOfOtherLines,
} from '@/shared/documents/components/serial-capture-field'

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

  it('accepts the 200-character contract boundary for a manufacturer serial number', () => {
    expect(
      assetLineSchema.safeParse(validLine({ assetInputs: [{ serialNumber: 'S'.repeat(200) }] }))
        .success,
    ).toBe(true)
  })

  it('rejects a serial number longer than 200 chars with an Arabic message', () => {
    const result = assetLineSchema.safeParse(
      validLine({ assetInputs: [{ serialNumber: 'S'.repeat(201) }] }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب ألا يتجاوز الرقم التسلسلي 200 محرفاً.')
    }
  })

  it('accepts a short manufacturer serial number', () => {
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

  it('maps asset lines to what the request contract can actually carry', () => {
    // The live `CompleteWarehouseDocumentDraftLine` carries `assetInputs`, the
    // collection the draft route reads to register one Asset per unit at post
    // (D-MAT-01), so the captured identity travels with the line.
    //
    // Two rules hold inside `assetInputs`:
    //  - a blank member is OMITTED rather than sent as an empty string, because a
    //    blank asset number is a recorded decision meaning "generate one at post",
    //    and a blank serial on a Quantity-tracked material is forbidden outright;
    //  - `acquisitionDate` / `warrantyExpiry` have no slot on the wire `AssetInput`,
    //    so the server derives them when it creates the Asset.
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

    expect(toCompleteDraftAssetLines(lines)).toEqual([
      {
        materialId: MATERIAL_ID,
        quantity: 2,
        assetInputs: [
          { assetNumber: '  A-1001  ' },
          { assetNumber: 'A-1002', serialNumber: 'SN-9002' },
        ],
      },
      // A unit with neither number is sent as an empty input: that empty object
      // IS the "allocate both at post" decision, not an absent collection.
      { materialId: MATERIAL_ID, quantity: 1, assetInputs: [{}] },
    ])
  })

  it('keeps a blank asset number as a recorded "allocate one at post" decision', () => {
    // `assetNumber` is optional for BOTH tracking types: blank means the server
    // generates `AST-{assetId}`, supplied means a user-entered unique number.
    const parsed = assetInputSchema.safeParse({ assetNumber: '', serialNumber: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      // Trimmed to an empty string, which the wire treats as "no number supplied";
      // the mapper that would have to drop it is the one that cannot run today.
      expect(parsed.data.assetNumber).toBe('')
      expect(parsed.data.serialNumber).toBe('')
    }
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
    const asset: Material = createMaterial({
      materialKind: 'Asset',
      requiresAssetNumber: true,
    })
    const consumable: Material = createMaterial({ materialKind: 'Consumable' })
    expect(isAssetMaterial(asset)).toBe(true)
    expect(isAssetMaterial(consumable)).toBe(false)
    if (asset.materialKind === 'Asset') {
      expect(asset.requiresAssetNumber).toBe(true)
    }
  })
})

describe('asset-line bulk serial capture (o098.3)', () => {
  it('applies a captured serial list as one unit per serial with quantity equal to the unit count', () => {
    const captured = parseSerialList(
      ['  SN-1001  ', 'SN-1002', 'sn-1001', 'S'.repeat(201), 'SN-9002'].join('\n'),
      ['sn-9002'],
    )

    expect(captured.serials).toEqual(['SN-1001', 'SN-1002'])
    expect(captured.rejected).toEqual([
      { value: 'sn-1001', reasonAr: 'مكرر داخل القائمة' },
      { value: 'S'.repeat(201), reasonAr: 'أطول من الحد المسموح (200 حرف)' },
      { value: 'SN-9002', reasonAr: 'مستخدم في بند آخر' },
    ])

    const line = validLine({
      quantity: captured.serials.length,
      assetInputs: captured.serials.map((serialNumber) => ({ serialNumber })),
    })
    const parsed = assetLineSchema.safeParse(line)
    expect(parsed.success).toBe(true)
    if (!parsed.success) {
      return
    }

    // The wire shape is unchanged: one `assetInputs` entry per serial, and the
    // asset number stays absent so the server allocates it at post.
    expect(toCompleteDraftAssetLines([parsed.data])).toEqual([
      {
        materialId: MATERIAL_ID,
        quantity: 2,
        assetInputs: [{ serialNumber: 'SN-1001' }, { serialNumber: 'SN-1002' }],
      },
    ])
  })

  it('rejects a serial already captured by another line of the same document', () => {
    const serialsByLine = [['SN-1001', 'SN-1002'], ['SN-3001']]

    const captured = parseSerialList('SN-1001\nSN-3001', serialsOfOtherLines(serialsByLine, 1))

    expect(captured.serials).toEqual(['SN-3001'])
    expect(captured.rejected).toEqual([{ value: 'SN-1001', reasonAr: 'مستخدم في بند آخر' }])
    expect(serialsOfOtherLines(serialsByLine, 0)).toEqual(['SN-3001'])
  })

  it('rejects a serial already on the same row with its own reason', () => {
    const captured = parseSerialList('SN-1001\nSN-1002', [], ['sn-1001'])

    expect(captured.serials).toEqual(['SN-1002'])
    expect(captured.rejected).toEqual([{ value: 'SN-1001', reasonAr: 'مكرر في هذا البند' }])
  })
})
