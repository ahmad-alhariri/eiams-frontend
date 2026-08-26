import { describe, expect, it } from 'vitest'

import { balanceHintAr, overBalance } from '@/shared/documents/schemas/document-lines.schemas'

describe('overBalance', () => {
  it('blocks when the requested quantity exceeds a known balance', () => {
    expect(overBalance(5, 6)).toBe(true)
    expect(overBalance(5, 5)).toBe(false)
    expect(overBalance(5, 0)).toBe(false)
  })

  it('treats a missing balance row (null) as zero available', () => {
    expect(overBalance(null, 1)).toBe(true)
    expect(overBalance(null, 0)).toBe(false)
  })

  it('never blocks while the balance is unknown', () => {
    expect(overBalance(undefined, 999)).toBe(false)
  })

  it('treats an untouched quantity as zero', () => {
    expect(overBalance(0, undefined)).toBe(false)
    expect(overBalance(null, undefined)).toBe(false)
  })
})

describe('balanceHintAr', () => {
  it('renders nothing while the balance is unknown or loading', () => {
    expect(balanceHintAr(undefined, 3)).toBeNull()
  })

  it('states the available stock when the request fits', () => {
    expect(balanceHintAr(12, 3)).toBe('الرصيد المتاح في المستودع: ١٢')
    expect(balanceHintAr(null, 0)).toBe('الرصيد المتاح في المستودع: ٠')
  })

  it('phrases an over-balance request as the blocking problem', () => {
    const hint = balanceHintAr(2, 5)
    expect(hint).toContain('تتجاوز الرصيد المتاح')
    expect(hint).toContain('٢')
  })
})
