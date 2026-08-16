import { describe, expect, it } from 'vitest'

import {
  counterpartStatusLabelAr,
  validateCounterpartForWrite,
} from '@/modules/organization/types/counterpart-lookup.types'
import type { CounterpartOption } from '@/shared/types/generated/eiams-v1'
import { fixtureUuid } from '@/test/msw/factories'

function createCounterpart(status: CounterpartOption['status']): CounterpartOption {
  return {
    displayName: 'الجهة التجريبية',
    id: fixtureUuid(63),
    status,
    type: 'External',
  }
}

describe('counterpart write validation', () => {
  it('allows active server choices and blocks missing or inactive choices in Arabic', () => {
    expect(validateCounterpartForWrite(createCounterpart('Active'))).toEqual({ isValid: true })
    expect(validateCounterpartForWrite(undefined)).toEqual({
      isValid: false,
      messageAr: 'اختر جهة مستلمة أو حائزة نشطة.',
    })
    expect(validateCounterpartForWrite(createCounterpart('Inactive'))).toEqual({
      isValid: false,
      messageAr: 'الجهة المختارة غير نشطة. اختر جهة نشطة أخرى قبل المتابعة.',
    })
  })

  it('keeps an inactive historical label available for read-only presentation', () => {
    expect(counterpartStatusLabelAr(createCounterpart('Active'))).toBe('نشط')
    expect(counterpartStatusLabelAr(createCounterpart('Inactive'))).toBe('غير نشط')
  })
})
