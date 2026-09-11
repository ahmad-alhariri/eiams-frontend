import { describe, expect, it } from 'vitest'

import {
  counterpartStatusLabelAr,
  validateCounterpartForWrite,
} from '@/modules/organization/types/counterpart-lookup.types'
import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import { fixtureUuid } from '@/test/msw/factories'

function createCounterpart(status: 'Active' | 'Inactive'): ExternalParty {
  return {
    externalPartyId: fixtureUuid(63),
    nameAr: 'الجهة التجريبية',
    code: ' ExtTest',
    status,
    rowVersion: 1,
  } as ExternalParty
}

describe('counterpart write validation', () => {
  it('allows active server choices and blocks missing or inactive choices in Arabic', () => {
    expect(validateCounterpartForWrite(createCounterpart('Active'))).toEqual({ isValid: true, reference: { type: 'ExternalParty', id: expect.any(String) } })
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
