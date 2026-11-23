import { describe, expect, it } from 'vitest'

import {
  employeeFormSchema,
  normalizeSyrianMobile,
  toCreateEmployeeRequest,
  toUpdateEmployeeRequest,
} from './employee.schemas'

const VALID_VALUES = {
  employeeNumber: 'EMP-001',
  fullName: 'موظف تجريبي',
  jobTitle: 'أمين مستودع',
  orgUnitId: '00000000-0000-4000-8000-000000000052',
  email: '',
  phone: '+963931234567',
}

describe('employeeFormSchema', () => {
  it('accepts the backend fullName maximum of 200 characters', () => {
    const nameAtContractLimit = 'م'.repeat(200)

    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: nameAtContractLimit })
        .success,
    ).toBe(true)
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: 'م'.repeat(201) }).success,
    ).toBe(false)
  })

  it('rejects blank required identifiers so empty submissions never reach the server', () => {
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: '' }).success).toBe(
      false,
    )
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: '   ' }).success).toBe(
      false,
    )
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, employeeNumber: '' }).success,
    ).toBe(false)
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, employeeNumber: '   ' }).success,
    ).toBe(false)
  })

  it('requires the org unit and the employee number only in create mode', () => {
    // `PUT /employees/{id}` binds neither, so the edit form must not demand them.
    const withoutCreateOnly = { ...VALID_VALUES, orgUnitId: '', employeeNumber: '' }

    expect(employeeFormSchema(true).safeParse(withoutCreateOnly).success).toBe(false)
    expect(employeeFormSchema(false).safeParse(withoutCreateOnly).success).toBe(true)
  })

  it('carries no status field: neither write body binds one', () => {
    const parsed = employeeFormSchema(true).parse({ ...VALID_VALUES })

    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('rowVersion')
    expect(parsed).not.toHaveProperty('fullNameAr')
    expect(parsed).not.toHaveProperty('jobTitleAr')
  })

  it('requires a phone and rejects a non-Syrian-mobile number', () => {
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, phone: '' }).success).toBe(false)
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, phone: '09312345678' }).success).toBe(
      false,
    )
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, phone: '+96311234567' }).success).toBe(
      false,
    )
  })

  it('accepts national and international input and normalises it to canonical form', () => {
    for (const input of ['0931234567', '931234567', '+963931234567', '0931 234-567']) {
      const values = employeeFormSchema(true).parse({ ...VALID_VALUES, phone: input })
      expect(normalizeSyrianMobile(input)).toBe('+963931234567')
      expect(toCreateEmployeeRequest(values).phone).toBe('+963931234567')
      expect(toUpdateEmployeeRequest(values).phone).toBe('+963931234567')
    }
    expect(normalizeSyrianMobile('123')).toBeNull()
  })

  it('treats email as optional but enforces format and the ASCII restriction when supplied', () => {
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, email: '' }).success).toBe(true)
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, email: 'a@example.com' }).success).toBe(
      true,
    )
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, email: 'not-an-email' }).success).toBe(
      false,
    )
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, email: 'مثال@example.com' }).success).toBe(
      false,
    )
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, email: `${'a'.repeat(252)}@b.co` })
        .success,
    ).toBe(false)
  })

  it('maps a blank email to null on both write bodies', () => {
    const parsed = employeeFormSchema(true).parse({ ...VALID_VALUES, email: '   ' })
    expect(toCreateEmployeeRequest(parsed).email).toBeNull()
    expect(toUpdateEmployeeRequest(parsed).email).toBeNull()
  })
})
