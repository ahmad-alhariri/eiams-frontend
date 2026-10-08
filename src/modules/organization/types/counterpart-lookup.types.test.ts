import { describe, expect, it } from 'vitest'

import {
  counterpartStatusLabelAr,
  validateCounterpartForWrite,
} from '@/modules/organization/types/counterpart-lookup.types'
import type { CounterpartResolution } from '@/modules/organization/types/counterpart-lookup.types'
import { fixtureUuid } from '@/test/msw/factories'

function createCounterpart(status: 'Active' | 'Inactive'): CounterpartResolution {
  return {
    type: 'External',
    id: fixtureUuid(63),
    displayName: 'الجهة التجريبية',
    secondaryLabelAr: null,
    status,
  }
}

describe('counterpart write validation', () => {
  it('allows active server choices and blocks missing or inactive choices in Arabic', () => {
    expect(validateCounterpartForWrite(createCounterpart('Active'))).toEqual({
      isValid: true,
      reference: { type: 'External', id: expect.any(String) },
    })
    expect(validateCounterpartForWrite(undefined)).toEqual({
      isValid: false,
      messageAr: 'اختر جهة مستلمة أو حائزة نشطة.',
    })
    expect(validateCounterpartForWrite(createCounterpart('Inactive'))).toEqual({
      isValid: false,
      messageAr: 'الجهة المختارة غير نشطة. اختر جهة نشطة أخرى قبل المتابعة.',
    })
  })

  it('produces an Arabic status hint for read-only presentation', () => {
    expect(counterpartStatusLabelAr(createCounterpart('Active'))).toContain('نشط')
    expect(counterpartStatusLabelAr(createCounterpart('Inactive'))).toContain('غير نشط')
  })
})
