import { describe, expect, it } from 'vitest'

import {
  CAPABILITY_OPERATION_VALUES,
  isCapabilityOperation,
  operationFromOrdinal,
  operationOrdinal,
  statusOrdinal,
} from '@/modules/warehouse/types/warehouse.types'

/**
 * The add/remove wire asymmetry is encoded in exactly ONE place:
 * `CAPABILITY_OPERATION_VALUES` (+ its `operationOrdinal`/`operationFromOrdinal`
 * accessors) and `statusOrdinal`. `addWarehouseCapabilityOperation` POSTs the
 * INT ordinal; `removeWarehouseCapabilityOperation` DELETEs the enum NAME
 * string; the material-setting status route binds an `int Status`. These tests
 * pin both ordinal tables so no second, drifting copy can exist.
 */
describe('CapabilityOperation ordinal encoding (single source of truth)', () => {
  it('matches the backend Domain.Common.OperationType declaration order, Adjustment=5', () => {
    expect(CAPABILITY_OPERATION_VALUES).toEqual([
      'Receiving',
      'Issue',
      'Transfer',
      'Count',
      'Return',
      'Adjustment',
    ])
    expect(operationOrdinal('Receiving')).toBe(0)
    expect(operationOrdinal('Issue')).toBe(1)
    expect(operationOrdinal('Transfer')).toBe(2)
    expect(operationOrdinal('Count')).toBe(3)
    expect(operationOrdinal('Return')).toBe(4)
    expect(operationOrdinal('Adjustment')).toBe(5)
  })

  it('round-trips every ordinal through operationFromOrdinal', () => {
    for (const [ordinal, name] of CAPABILITY_OPERATION_VALUES.entries()) {
      expect(operationOrdinal(name)).toBe(ordinal)
      expect(operationFromOrdinal(ordinal)).toBe(name)
    }
  })

  it('rejects an out-of-range ordinal rather than silently projecting `undefined`', () => {
    expect(() => operationFromOrdinal(6)).toThrow(RangeError)
    expect(() => operationFromOrdinal(-1)).toThrow(RangeError)
  })

  it('narrows an arbitrary string to a known operation', () => {
    expect(isCapabilityOperation('Adjustment')).toBe(true)
    expect(isCapabilityOperation('adjustment')).toBe(false)
    expect(isCapabilityOperation('Reversed')).toBe(false)
  })
})

describe('statusOrdinal — the material-setting status int-vs-name asymmetry', () => {
  it('maps Active=0 and Inactive=1, matching Domain.Common.Status', () => {
    expect(statusOrdinal('Active')).toBe(0)
    expect(statusOrdinal('Inactive')).toBe(1)
  })
})
