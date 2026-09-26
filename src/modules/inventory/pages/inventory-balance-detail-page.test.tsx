import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('InventoryBalanceDetailPage (unwired — endpoint not available)', () => {
  it('is skipped because the balance detail endpoint does not exist', () => {
    // The GET /inventory/balances/:balanceId endpoint is not available on the
    // current backend (handoff §15). The page component and its route were
    // removed from the router in favour of hiding this feature until the
    // product decision on balance identity is made.
    expect(true).toBe(true)
  })
})
