import { describe, expect, it } from 'vitest'

import {
  createEmptyQuantityLine,
  toCompleteDraftLines,
  type QuantityLineValues,
} from './document-lines.schemas'

const ASSET_ID_A = '11111111-1111-4111-8111-111111111111'
const ASSET_ID_B = '22222222-2222-4222-8222-222222222222'

function assetLine(overrides: Partial<QuantityLineValues> = {}): QuantityLineValues {
  return {
    ...createEmptyQuantityLine(),
    materialId: ASSET_ID_A,
    materialNameAr: 'حاسوب مكتبي',
    materialKind: 'Asset',
    quantity: 2,
    assetIds: [ASSET_ID_A, ASSET_ID_B],
    ...overrides,
  }
}

describe('D-IAR-01 line mapping', () => {
  it('emits assetIds for an Asset-kind line that has selections', () => {
    const inputs = toCompleteDraftLines([assetLine()])
    expect(inputs[0]).toMatchObject({
      materialId: ASSET_ID_A,
      quantity: 2,
      assetIds: [ASSET_ID_A, ASSET_ID_B],
    })
  })

  it('drops assetIds when the material kind is not Asset (snapshot drift guard)', () => {
    const inputs = toCompleteDraftLines([assetLine({ materialKind: 'Consumable' })])
    expect(inputs[0]?.assetIds).toBeUndefined()
  })

  it('omits assetIds when the selection is empty', () => {
    const inputs = toCompleteDraftLines([assetLine({ assetIds: [] })])
    expect(inputs[0]?.assetIds).toBeUndefined()
  })

  it('never leaks assetIds from a line that carries no material kind at all', () => {
    // A server-loaded line never has the display snapshot the form captures, so
    // state can reach the mapper with `assetIds` set and no `materialKind`.
    const withoutKind = { ...assetLine(), materialKind: undefined }
    expect(toCompleteDraftLines([withoutKind])[0]?.assetIds).toBeUndefined()
  })
})
