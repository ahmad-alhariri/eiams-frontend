import { describe, expect, it } from 'vitest'

import { employeeFormSchema } from './employee.schemas'
import { externalPartySchema } from './external-party.schemas'
import { siteFormSchema } from './site.schemas'

const SITE_VALUES = {
  organizationId: '00000000-0000-4000-8000-000000000051',
  code: 'SITE-001',
  name: 'موقع',
  location: '',
  governorateCode: '',
}

const EMPLOYEE_VALUES = {
  orgUnitId: '00000000-0000-4000-8000-000000000052',
  employeeNumber: 'EMP-001',
  fullName: 'موظف',
  phone: '+963931234567',
}

describe('frontend validation limits aligned to backend validators (K-4)', () => {
  it('Site: location max 300, governorate max 20 with the backend ASCII format', () => {
    expect(
      siteFormSchema(true).safeParse({ ...SITE_VALUES, location: 'ع'.repeat(300) }).success,
    ).toBe(true)
    expect(
      siteFormSchema(true).safeParse({ ...SITE_VALUES, location: 'ع'.repeat(301) }).success,
    ).toBe(false)
    expect(siteFormSchema(true).safeParse({ ...SITE_VALUES, governorateCode: 'DIM' }).success).toBe(
      true,
    )
    expect(
      siteFormSchema(true).safeParse({ ...SITE_VALUES, governorateCode: 'A'.repeat(21) }).success,
    ).toBe(false)
    expect(
      siteFormSchema(true).safeParse({ ...SITE_VALUES, governorateCode: 'دمشق' }).success,
    ).toBe(false)
    // A blank governorate is optional and must stay valid (backend validates only non-blank).
    expect(siteFormSchema(true).safeParse(SITE_VALUES).success).toBe(true)
  })

  it('Employee: jobTitle max 100, fullName max 200, phone max 20', () => {
    expect(
      employeeFormSchema(true).safeParse({ ...EMPLOYEE_VALUES, jobTitle: 'م'.repeat(100) }).success,
    ).toBe(true)
    expect(
      employeeFormSchema(true).safeParse({ ...EMPLOYEE_VALUES, jobTitle: 'م'.repeat(101) }).success,
    ).toBe(false)
    expect(
      employeeFormSchema(true).safeParse({ ...EMPLOYEE_VALUES, fullName: 'م'.repeat(201) }).success,
    ).toBe(false)
    expect(
      employeeFormSchema(true).safeParse({ ...EMPLOYEE_VALUES, phone: '+96393123456789012345' })
        .success,
    ).toBe(false)
  })

  it('ExternalParty: nameAr required with NotEmpty semantics and max 200', () => {
    expect(externalPartySchema.safeParse({ nameAr: 'ا' }).success).toBe(true)
    expect(externalPartySchema.safeParse({ nameAr: '' }).success).toBe(false)
    expect(externalPartySchema.safeParse({ nameAr: 'ا'.repeat(200) }).success).toBe(true)
    expect(externalPartySchema.safeParse({ nameAr: 'ا'.repeat(201) }).success).toBe(false)
  })
})
