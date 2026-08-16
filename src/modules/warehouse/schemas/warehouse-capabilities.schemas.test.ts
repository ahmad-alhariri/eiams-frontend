import { describe, expect, it } from 'vitest'

import { createWarehouseCapability } from '@/test/msw/factories'

import {
  toWarehouseCapabilitiesRequest,
  warehouseCapabilitiesSchema,
} from './warehouse-capabilities.schemas'

describe('warehouseCapabilitiesSchema', () => {
  it('rejects duplicate domains and a capability with no operation', () => {
    const domainId = '00000000-0000-4000-8000-000000000020'

    const result = warehouseCapabilitiesSchema.safeParse({
      capabilities: [
        { domainId, operations: ['Receiving'] },
        { domainId, operations: [] },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'لا يمكن تكرار مجال المواد في قدرات المستودع.',
          'يجب اختيار عملية واحدة على الأقل لكل مجال.',
        ]),
      )
    }
  })

  it('preserves current row versions and uses zero only for a new capability', () => {
    const current = createWarehouseCapability({ rowVersion: 9 })
    const newDomainId = '00000000-0000-4000-8000-000000000099'

    expect(
      toWarehouseCapabilitiesRequest(
        {
          capabilities: [
            { domainId: current.domain.id, operations: ['Receiving', 'Return'] },
            { domainId: newDomainId, operations: ['Count'] },
          ],
        },
        [current],
      ),
    ).toEqual([
      { domainId: current.domain.id, operations: ['Receiving', 'Return'], rowVersion: 9 },
      { domainId: newDomainId, operations: ['Count'], rowVersion: 0 },
    ])
  })
})
